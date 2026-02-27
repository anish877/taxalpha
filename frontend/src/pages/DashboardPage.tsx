import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ApiError, apiRequest } from '../api/client';
import { CreateClientDrawer } from '../components/create-client/CreateClientDrawer';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { ClientRecord, FormCatalogItem } from '../types/api';

export function DashboardPage() {
  const { user, signOut } = useAuth();
  const { pushToast } = useToast();
  const navigate = useNavigate();

  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [forms, setForms] = useState<FormCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const hasInvestorProfileForm = forms.some((form) => form.code === 'INVESTOR_PROFILE');
  const canOpenCreateClient = !loading && !error && hasInvestorProfileForm;

  const handleOpenCreateClient = () => {
    if (!canOpenCreateClient) {
      pushToast(
        hasInvestorProfileForm
          ? 'Please wait until dashboard data finishes loading.'
          : 'Investor Profile form is unavailable. Seed forms and refresh.',
        'error'
      );
      return;
    }

    setDrawerOpen(true);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [clientsResponse, formsResponse] = await Promise.all([
        apiRequest<{ clients: ClientRecord[] }>('/api/clients'),
        apiRequest<{ forms: FormCatalogItem[] }>('/api/forms')
      ]);

      setClients(clientsResponse.clients);
      setForms(formsResponse.forms);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.statusCode === 401) {
        await signOut();
        navigate('/signin', { replace: true });
        return;
      }

      setError('Unable to load dashboard data. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, [navigate, signOut]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/signin', { replace: true });
  };

  const handleClientCreated = (client: ClientRecord) => {
    setClients((current) => [client, ...current]);
    setDrawerOpen(false);
  };

  return (
    <main className="min-h-screen bg-fog px-4 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-3xl border border-black/10 bg-paper px-5 py-5 shadow-hairline sm:px-8 sm:py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-mute">TaxAlpha Dashboard</p>
              <h1 className="mt-2 text-3xl font-light tracking-tight text-ink">Client Workspace</h1>
              <p className="mt-2 text-sm text-mute">Signed in as {user?.name}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                className="rounded-full border border-line px-4 py-2 text-sm text-ink transition hover:border-black"
                type="button"
                onClick={handleOpenCreateClient}
              >
                New Client
              </button>
              <button
                className="rounded-full border border-line px-4 py-2 text-sm text-mute transition hover:border-black hover:text-ink"
                type="button"
                onClick={() => {
                  void handleSignOut();
                }}
              >
                Sign Out
              </button>
            </div>
          </div>
        </header>

        <section className="mt-6 rounded-3xl border border-black/10 bg-paper p-4 shadow-hairline sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-light text-ink">Clients</h2>
            <button
              className="rounded-full bg-accent px-4 py-2 text-xs uppercase tracking-[0.18em] text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-accent/45"
              disabled={!canOpenCreateClient}
              type="button"
              onClick={handleOpenCreateClient}
            >
              Create Client
            </button>
          </div>

          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map((placeholder) => (
                <div key={placeholder} className="h-16 animate-pulse rounded-2xl bg-fog" />
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-black/15 bg-black px-4 py-3 text-sm text-white">
              {error}
            </div>
          )}

          {!loading && !error && clients.length === 0 && (
            <div className="rounded-2xl border border-dashed border-line px-5 py-10 text-center">
              <p className="text-lg font-light text-ink">No clients yet.</p>
              <p className="mt-2 text-sm text-mute">
                Start by creating your first client and selecting the required forms.
              </p>
            </div>
          )}

          {!loading && !error && clients.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-line">
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead className="bg-fog text-xs uppercase tracking-[0.16em] text-mute">
                    <tr>
                      <th className="px-4 py-3 font-medium">Client</th>
                      <th className="px-4 py-3 font-medium">Primary Broker</th>
                      <th className="px-4 py-3 font-medium">Forms</th>
                      <th className="px-4 py-3 font-medium">Onboarding</th>
                      <th className="px-4 py-3 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((client) => {
                      const showContinue =
                        client.hasInvestorProfile && client.investorProfileOnboardingStatus !== 'COMPLETED';

                      return (
                        <tr key={client.id} className="border-t border-line/70">
                          <td className="px-4 py-3 align-top">
                            <p className="font-light text-ink">{client.name}</p>
                            <p className="mt-1 text-xs text-mute">{client.email}</p>
                            {client.phone && <p className="mt-1 text-xs text-mute">{client.phone}</p>}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <p className="font-light text-ink">{client.primaryBroker?.name ?? '-'}</p>
                            <p className="mt-1 text-xs text-mute">{client.primaryBroker?.email ?? '-'}</p>
                            {client.additionalBrokers.length > 0 && (
                              <p className="mt-2 text-xs text-mute">
                                +{client.additionalBrokers.length} additional broker
                                {client.additionalBrokers.length > 1 ? 's' : ''}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <p className="font-light text-ink">{client.selectedForms.length} selected</p>
                            <p className="mt-1 text-xs text-mute">
                              {client.selectedForms.map((form) => form.title).join(', ')}
                            </p>
                          </td>
                          <td className="px-4 py-3 align-top">
                            {!client.hasInvestorProfile ? (
                              <span className="text-xs text-mute">-</span>
                            ) : showContinue ? (
                              <button
                                className="rounded-full bg-accent px-3 py-1 text-xs uppercase tracking-[0.14em] text-white transition hover:bg-accent/90"
                                type="button"
                                onClick={() =>
                                  navigate(
                                    client.investorProfileResumeStepRoute ??
                                      `/clients/${client.id}/investor-profile/step-1`
                                  )
                                }
                              >
                                Continue
                              </button>
                            ) : (
                              <span className="rounded-full border border-line px-3 py-1 text-xs uppercase tracking-[0.14em] text-mute">
                                Completed
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 align-top text-xs text-mute">
                            {new Date(client.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>

      {user && (
        <CreateClientDrawer
          forms={forms}
          open={drawerOpen}
          primaryBroker={user}
          onClientCreated={handleClientCreated}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </main>
  );
}
