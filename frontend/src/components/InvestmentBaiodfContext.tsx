import { useEffect, useState } from 'react';

import { apiRequest } from '../api/client';
import type { FormWorkspaceRecord, InvestmentWorkspaceItem } from '../types/api';

export function InvestmentBaiodfContext({
  clientId,
  investmentId
}: {
  clientId?: string;
  investmentId?: string;
}) {
  const [context, setContext] = useState<{ clientName: string; investment: InvestmentWorkspaceItem } | null>(null);

  useEffect(() => {
    if (!clientId || !investmentId) {
      setContext(null);
      return;
    }
    let active = true;
    void apiRequest<{ workspace: FormWorkspaceRecord }>(`/api/clients/${clientId}/forms/workspace`)
      .then(({ workspace }) => {
        const investment = workspace.investments?.find((item) => item.id === investmentId);
        if (active && investment) setContext({ clientName: workspace.clientName, investment });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [clientId, investmentId]);

  if (!investmentId) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-mute">
      <span>{context?.clientName ?? 'Client'}</span>
      <span aria-hidden="true">·</span>
      <span className="font-medium text-ink">
        {context ? `Investment ${context.investment.position}: ${context.investment.name}` : 'Loading investment…'}
      </span>
    </div>
  );
}
