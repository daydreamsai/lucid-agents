/**
 * Unit Tests - Business Logic
 */
import { describe, it, expect } from 'bun:test';
import { SupplierDataService } from '../data-service';

describe('Unit Tests - Business Logic', () => {
  const service = new SupplierDataService();

  describe('getSupplierScore', () => {
    it('should return score for existing supplier', async () => {
      const result = await service.getSupplierScore('SUP001');
      expect(result).not.toBeNull();
      expect(result!.supplier_id).toBe('SUP001');
      expect(result!.supplier_score).toBeGreaterThan(0);
      expect(result!.supplier_score).toBeLessThanOrEqual(100);
    });

    it('should return null for non-existent supplier', async () => {
      expect(await service.getSupplierScore('SUP999')).toBeNull();
    });

    it('should filter by category', async () => {
      expect(await service.getSupplierScore('SUP001', 'electronics')).not.toBeNull();
      expect(await service.getSupplierScore('SUP001', 'textiles')).toBeNull();
    });

    it('should filter by region', async () => {
      expect(await service.getSupplierScore('SUP001', undefined, 'APAC')).not.toBeNull();
      expect(await service.getSupplierScore('SUP001', undefined, 'LATAM')).toBeNull();
    });

    it('should include confidence and freshness metadata', async () => {
      const result = await service.getSupplierScore('SUP001');
      expect(result!.confidence.level).toMatch(/^(low|medium|high)$/);
      expect(result!.confidence.score).toBeGreaterThanOrEqual(0);
      expect(result!.freshness.source).toBe('supplier-db-v1');
    });

    it('should return higher scores for better suppliers', async () => {
      const sup1 = await service.getSupplierScore('SUP001');
      const sup2 = await service.getSupplierScore('SUP002');
      const sup3 = await service.getSupplierScore('SUP003');
      expect(sup3!.supplier_score).toBeGreaterThan(sup1!.supplier_score);
      expect(sup1!.supplier_score).toBeGreaterThan(sup2!.supplier_score);
    });
  });

  describe('getLeadTimeForecast', () => {
    it('should return forecast for valid supplier/category/region', async () => {
      const result = await service.getLeadTimeForecast('SUP001', 'electronics', 'APAC', 30);
      expect(result).not.toBeNull();
      expect(result!.supplier_id).toBe('SUP001');
      expect(result!.horizon_days).toBe(30);
    });

    it('should return null for invalid category/region', async () => {
      expect(await service.getLeadTimeForecast('SUP001', 'textiles', 'APAC', 30)).toBeNull();
      expect(await service.getLeadTimeForecast('SUP001', 'electronics', 'LATAM', 30)).toBeNull();
    });

    it('should have P95 >= P50', async () => {
      const result = await service.getLeadTimeForecast('SUP001', 'electronics', 'APAC', 30);
      expect(result!.lead_time_p95).toBeGreaterThanOrEqual(result!.lead_time_p50);
    });

    it('should increase lead times for longer horizons', async () => {
      const short = await service.getLeadTimeForecast('SUP001', 'electronics', 'APAC', 30);
      const long = await service.getLeadTimeForecast('SUP001', 'electronics', 'APAC', 180);
      expect(long!.lead_time_p50).toBeGreaterThan(short!.lead_time_p50);
    });

    it('should identify correct trends', async () => {
      const sup2 = await service.getLeadTimeForecast('SUP002', 'components', 'APAC', 30);
      const sup3 = await service.getLeadTimeForecast('SUP003', 'electronics', 'NA', 30);
      expect(sup2!.trend).toBe('degrading');
      expect(sup3!.trend).toBe('improving');
    });
  });

  describe('getDisruptionAlerts', () => {
    it('should return alerts for existing supplier', async () => {
      const result = await service.getDisruptionAlerts('SUP001', 'medium');
      expect(result).not.toBeNull();
      expect(result!.supplier_id).toBe('SUP001');
    });

    it('should return null for non-existent supplier', async () => {
      expect(await service.getDisruptionAlerts('SUP999', 'medium')).toBeNull();
    });

    it('should return higher probability for low risk tolerance', async () => {
      const low = await service.getDisruptionAlerts('SUP002', 'low');
      const high = await service.getDisruptionAlerts('SUP002', 'high');
      expect(low!.disruption_probability).toBeGreaterThan(high!.disruption_probability);
    });

    it('should return alerts for risky suppliers', async () => {
      const result = await service.getDisruptionAlerts('SUP002', 'medium');
      expect(result!.alert_reasons.length).toBeGreaterThan(0);
    });

    it('should return fewer alerts for reliable suppliers', async () => {
      const result = await service.getDisruptionAlerts('SUP003', 'medium');
      expect(result!.alert_reasons.length).toBe(0);
    });

    it('should include recommendations', async () => {
      const result = await service.getDisruptionAlerts('SUP002', 'medium');
      expect(result!.recommended_actions.length).toBeGreaterThan(0);
    });

    it('should generate low_fill_rate alert when fill rate < 90%', async () => {
      const result = await service.getDisruptionAlerts('SUP002', 'medium');
      expect(result!.alert_reasons.find(a => a.code === 'low_fill_rate')).toBeDefined();
    });

    it('should generate delivery_delays alert when on-time rate < 85%', async () => {
      const result = await service.getDisruptionAlerts('SUP002', 'medium');
      expect(result!.alert_reasons.find(a => a.code === 'delivery_delays')).toBeDefined();
    });
  });

  describe('isDataStale', () => {
    it('should return false for fresh data', () => {
      expect(new SupplierDataService(86400000).isDataStale(3600000)).toBe(false);
    });
    it('should return true for stale data', () => {
      expect(new SupplierDataService(86400000).isDataStale(172800000)).toBe(true);
    });
  });

  describe('supplierExists', () => {
    it('should return true for existing suppliers', async () => {
      expect(await service.supplierExists('SUP001')).toBe(true);
      expect(await service.supplierExists('SUP002')).toBe(true);
    });
    it('should return false for non-existent suppliers', async () => {
      expect(await service.supplierExists('SUP999')).toBe(false);
    });
  });

  describe('Ranking Consistency', () => {
    it('should maintain consistent ranking', async () => {
      const scores1 = await Promise.all(['SUP001', 'SUP002', 'SUP003'].map(id => service.getSupplierScore(id)));
      const scores2 = await Promise.all(['SUP001', 'SUP002', 'SUP003'].map(id => service.getSupplierScore(id)));
      scores1.forEach((s, i) => expect(s!.supplier_score).toBe(scores2[i]!.supplier_score));
    });

    it('should rank suppliers correctly by score', async () => {
      const scores = await Promise.all(['SUP001', 'SUP002', 'SUP003'].map(id => service.getSupplierScore(id)));
      const sorted = [...scores].sort((a, b) => b!.supplier_score - a!.supplier_score);
      expect(sorted[0]!.supplier_id).toBe('SUP003');
      expect(sorted[2]!.supplier_id).toBe('SUP002');
    });
  });
});
