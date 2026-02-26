import type {
  Chain,
  GasQuoteRequest,
  GasQuoteResponse,
  GasForecastRequest,
  GasForecastResponse,
  GasCongestionRequest,
  GasCongestionResponse,
} from './schemas';
import type { GasDataProvider } from './core';
import {
  adjustFeeForUrgency,
  generateInclusionCurve,
  determineCongestionState,
  calculateConfidenceScore,
  forecastBaseFee,
  determineBasFeeTrend,
} from './core';

/**
 * Gas Oracle Service
 */
export class GasOracleService {
  private previousBaseFees: Map<Chain, bigint> = new Map();

  constructor(private provider: GasDataProvider) {}

  /**
   * Get gas quote with inclusion probability
   */
  async getQuote(request: GasQuoteRequest): Promise<GasQuoteResponse> {
    const { chain, urgency, txType, recentFailureTolerance } = request;

    // Fetch current data
    const baseFee = await this.provider.getCurrentBaseFee(chain);
    const priorityFee = await this.provider.getPriorityFee(chain);
    const pendingTxCount = await this.provider.getPendingTxCount(chain);
    const blockUtilization = await this.provider.getBlockUtilization(chain);

    // Adjust fees based on urgency and tx type
    const adjusted = adjustFeeForUrgency(baseFee, priorityFee, urgency, txType);

    // Generate inclusion probability curve
    const inclusionCurve = generateInclusionCurve(
      baseFee,
      adjusted.priority,
      urgency,
      5
    );

    // Determine congestion state
    const congestionState = determineCongestionState(pendingTxCount, blockUtilization);

    // Calculate confidence score
    const freshnessMs = 1000; // Assume 1s freshness for now
    const volatility = blockUtilization > 0.8 ? 0.2 : 0.1;
    const confidenceScore = calculateConfidenceScore(freshnessMs, volatility);

    return {
      recommended_max_fee: adjusted.maxFee.toString(),
      priority_fee: adjusted.priority.toString(),
      inclusion_probability_curve: inclusionCurve,
      congestion_state: congestionState,
      confidence_score: confidenceScore,
      freshness_ms: freshnessMs,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get gas forecast for future blocks
   */
  async getForecast(request: GasForecastRequest): Promise<GasForecastResponse> {
    const { chain, targetBlocks } = request;

    // Fetch current data
    const currentBaseFee = await this.provider.getCurrentBaseFee(chain);
    const currentPriorityFee = await this.provider.getPriorityFee(chain);
    const blockUtilization = await this.provider.getBlockUtilization(chain);
    const currentBlock = await this.provider.getCurrentBlock(chain);

    // Generate forecast
    const forecast = [];
    for (let offset = 0; offset < targetBlocks; offset++) {
      const forecastedBaseFee = forecastBaseFee(currentBaseFee, blockUtilization, offset);
      
      // Priority fee tends to be more stable
      const priorityMultiplier = 1 + (blockUtilization - 0.5) * 0.1;
      const forecastedPriorityFee = BigInt(
        Math.floor(Number(currentPriorityFee) * priorityMultiplier)
      );

      // Confidence decreases with distance
      const confidence = Math.max(0.5, 1 - offset * 0.05);

      forecast.push({
        block_offset: offset,
        estimated_base_fee: forecastedBaseFee.toString(),
        estimated_priority_fee: forecastedPriorityFee.toString(),
        confidence,
      });
    }

    const freshnessMs = 1500;

    return {
      chain,
      current_block: currentBlock,
      forecast,
      freshness_ms: freshnessMs,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get current congestion state
   */
  async getCongestion(request: GasCongestionRequest): Promise<GasCongestionResponse> {
    const { chain } = request;

    // Fetch current data
    const currentBaseFee = await this.provider.getCurrentBaseFee(chain);
    const pendingTxCount = await this.provider.getPendingTxCount(chain);
    const blockUtilization = await this.provider.getBlockUtilization(chain);

    // Determine congestion state
    const congestionState = determineCongestionState(pendingTxCount, blockUtilization);

    // Determine base fee trend
    const previousBaseFee = this.previousBaseFees.get(chain) ?? currentBaseFee;
    const baseFeeTrend = determineBasFeeTrend(currentBaseFee, previousBaseFee);
    this.previousBaseFees.set(chain, currentBaseFee);

    const freshnessMs = 1000;

    return {
      chain,
      congestion_state: congestionState,
      pending_tx_count: pendingTxCount,
      avg_block_utilization: blockUtilization,
      base_fee_trend: baseFeeTrend,
      freshness_ms: freshnessMs,
      timestamp: new Date().toISOString(),
    };
  }
}
