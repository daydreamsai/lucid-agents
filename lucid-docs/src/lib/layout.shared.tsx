import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import markColorUrl from '../../../brand/assets/mark-color.svg?url';
import markReverseUrl from '../../../brand/assets/mark-reverse.svg?url';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="lucid-docs-lockup" aria-label="Lucid Agents">
          <span className="lucid-docs-lockup-mark" aria-hidden="true">
            <img
              className="lucid-docs-mark lucid-docs-mark-light"
              src={markColorUrl}
              alt=""
            />
            <img
              className="lucid-docs-mark lucid-docs-mark-dark"
              src={markReverseUrl}
              alt=""
            />
          </span>
          <span className="lucid-docs-wordmark">
            <span>lucid</span>
            <span>AGENTS</span>
          </span>
        </span>
      ),
    },
    githubUrl: 'https://github.com/daydreamsai/lucid-agents',
  };
}
