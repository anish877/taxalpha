import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { ApiError, apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { AdminUserRecord, BrokerOption } from '../types/api';

interface BrokerDraft {
  representativeName: string;
  email: string;
  firmName: string;
  brokerDealerCrdNumber: string;
  representativeCrdNumber: string;
  repCode: string;
  branchAddressLine1: string;
  branchAddressLine2: string;
  branchCity: string;
  branchState: string;
  branchPostalCode: string;
  branchPhone: string;
}

const emptyBroker = (): BrokerDraft => ({
  representativeName: '',
  email: '',
  firmName: '',
  brokerDealerCrdNumber: '',
  representativeCrdNumber: '',
  repCode: '',
  branchAddressLine1: '',
  branchAddressLine2: '',
  branchCity: '',
  branchState: '',
  branchPostalCode: '',
  branchPhone: ''
});

const inputClass =
  'w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none ring-accent transition focus:border-accent focus:ring-1';

function BrokerFields({ value, onChange }: { value: BrokerDraft; onChange: (next: BrokerDraft) => void }) {
  const field = (key: keyof BrokerDraft, label: string, placeholder = '') => (
    <label className="block">
      <span className="mb-1.5 block text-xs uppercase tracking-[0.12em] text-mute">{label}</span>
      <input
        aria-label={label}
        className={inputClass}
        placeholder={placeholder}
        required={key === 'representativeName' || key === 'email' || key === 'firmName'}
        type={key === 'email' ? 'email' : 'text'}
        value={value[key]}
        onChange={(event) => onChange({ ...value, [key]: event.target.value })}
      />
    </label>
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {field('representativeName', 'Registered Representative Name', 'Jane Advisor')}
      {field('email', 'E-mail Address', 'advisor@example.com')}
      <div className="sm:col-span-2">{field('firmName', 'Broker-Dealer Firm Name', 'Example Securities LLC')}</div>
      {field('brokerDealerCrdNumber', 'Broker-Dealer CRD No.')}
      {field('representativeCrdNumber', 'Registered Representative CRD No.')}
      {field('repCode', 'Rep Code')}
      <div className="sm:col-span-2">{field('branchAddressLine1', 'Branch Address')}</div>
      <div className="sm:col-span-2">{field('branchAddressLine2', 'Branch Address Line 2')}</div>
      {field('branchCity', 'City')}
      {field('branchState', 'State')}
      {field('branchPostalCode', 'ZIP')}
      {field('branchPhone', 'Branch Phone Number')}
    </div>
  );
}

export function AdminUsersPage() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { pushToast } = useToast();
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [brokers, setBrokers] = useState<BrokerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [brokerDraft, setBrokerDraft] = useState<BrokerDraft>(emptyBroker);
  const [editingBrokerId, setEditingBrokerId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersResponse, brokersResponse] = await Promise.all([
        apiRequest<{ users: AdminUserRecord[] }>('/api/admin/users'),
        apiRequest<{ brokers: BrokerOption[] }>('/api/admin/brokers')
      ]);
      setUsers(usersResponse.users);
      setBrokers(brokersResponse.brokers);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.statusCode === 401) {
        await signOut();
        navigate('/signin', { replace: true });
        return;
      }
      setError(requestError instanceof ApiError ? requestError.message : 'Unable to load users.');
    } finally {
      setLoading(false);
    }
  }, [navigate, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const createUser = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await apiRequest<{ user: AdminUserRecord }>('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email,
          password,
          isAdmin
        })
      });
      setUsers((current) => [...current, response.user].sort((a, b) => a.name.localeCompare(b.name)));
      setName('');
      setEmail('');
      setPassword('');
      setIsAdmin(false);
      pushToast('User created. They can now sign in with the temporary password.');
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Unable to create user.');
    } finally {
      setSubmitting(false);
    }
  };

  const createBroker = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await apiRequest<{ broker: BrokerOption }>(
        editingBrokerId ? `/api/admin/brokers/${editingBrokerId}` : '/api/admin/brokers',
        {
        method: editingBrokerId ? 'PATCH' : 'POST',
        body: JSON.stringify(brokerDraft)
        }
      );
      setBrokers((current) => (
        editingBrokerId
          ? current.map((broker) => broker.id === editingBrokerId ? response.broker : broker)
          : [...current, response.broker].sort((a, b) => a.name.localeCompare(b.name))
      ));
      setBrokerDraft(emptyBroker());
      setEditingBrokerId(null);
      pushToast(editingBrokerId ? 'Broker details updated.' : 'Broker created and available in Client Intake.');
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Unable to create broker.');
    } finally {
      setSubmitting(false);
    }
  };

  const editBroker = (broker: BrokerOption) => {
    setEditingBrokerId(broker.id);
    setBrokerDraft({
      representativeName: broker.name,
      email: broker.email,
      firmName: broker.firmName ?? '',
      brokerDealerCrdNumber: broker.brokerDealerCrdNumber ?? '',
      representativeCrdNumber: broker.representativeCrdNumber ?? '',
      repCode: broker.repCode ?? '',
      branchAddressLine1: broker.branchAddressLine1 ?? '',
      branchAddressLine2: broker.branchAddressLine2 ?? '',
      branchCity: broker.branchCity ?? '',
      branchState: broker.branchState ?? '',
      branchPostalCode: broker.branchPostalCode ?? '',
      branchPhone: broker.branchPhone ?? ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <main className="min-h-screen bg-fog px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl border border-black/10 bg-paper p-6 shadow-hairline sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-accent">Administration</p>
              <h1 className="mt-2 text-3xl font-light tracking-tight text-ink">Users & Brokers</h1>
            <p className="mt-2 text-sm text-mute">Provision platform users and maintain the broker directory used in Client Intake and AI document filling.</p>
            </div>
            <div className="flex gap-2">
              <button className="rounded-full border border-line px-4 py-2 text-sm" type="button" onClick={() => navigate('/dashboard')}>Dashboard</button>
            </div>
          </div>
        </header>

        {error && <div className="rounded-2xl bg-black px-4 py-3 text-sm text-white">{error}</div>}

        <div className="grid gap-6 xl:grid-cols-2">
          <form className="rounded-3xl border border-black/10 bg-paper p-6 shadow-hairline" onSubmit={createUser}>
            <h2 className="text-xl font-light text-ink">Create User</h2>
            <p className="mt-1 text-sm text-mute">Create a login for a team member who will create and manage clients.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label><span className="mb-1.5 block text-xs uppercase tracking-[0.12em] text-mute">Name</span><input className={inputClass} required value={name} onChange={(e) => setName(e.target.value)} /></label>
              <label><span className="mb-1.5 block text-xs uppercase tracking-[0.12em] text-mute">Email</span><input className={inputClass} required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
              <label><span className="mb-1.5 block text-xs uppercase tracking-[0.12em] text-mute">Temporary Password</span><input className={inputClass} minLength={8} required type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
              <label className="flex items-center gap-3 pt-6 text-sm text-ink"><input checked={isAdmin} type="checkbox" onChange={(e) => setIsAdmin(e.target.checked)} /> Administrator</label>
            </div>
            <button className="mt-6 rounded-full bg-accent px-5 py-3 text-xs uppercase tracking-[0.16em] text-white disabled:opacity-50" disabled={submitting} type="submit">Create User</button>
          </form>

          <form className="rounded-3xl border border-black/10 bg-paper p-6 shadow-hairline" onSubmit={createBroker}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-light text-ink">{editingBrokerId ? 'Edit Broker' : 'Create Broker'}</h2>
                <p className="mt-1 text-sm text-mute">Brokers are independent of users and available to every team member in Client Intake.</p>
              </div>
              {editingBrokerId && <button className="text-xs uppercase tracking-[0.14em] text-mute" type="button" onClick={() => { setEditingBrokerId(null); setBrokerDraft(emptyBroker()); }}>Cancel</button>}
            </div>
            <div className="mt-5"><BrokerFields value={brokerDraft} onChange={setBrokerDraft} /></div>
            <button className="mt-6 rounded-full bg-black px-5 py-3 text-xs uppercase tracking-[0.16em] text-white disabled:opacity-50" disabled={submitting} type="submit">{editingBrokerId ? 'Save Broker' : 'Create Broker'}</button>
          </form>
        </div>

        <section className="rounded-3xl border border-black/10 bg-paper p-6 shadow-hairline">
          <h2 className="text-xl font-light text-ink">Provisioned Users</h2>
          {loading ? <p className="mt-4 text-sm text-mute">Loading…</p> : (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {users.map((user) => (
                <article key={user.id} className="rounded-2xl border border-line p-4">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-medium text-ink">{user.name}</p><p className="mt-1 text-sm text-mute">{user.email}</p></div>{user.isAdmin && <span className="rounded-full bg-black px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-white">Admin</span>}</div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-black/10 bg-paper p-6 shadow-hairline">
          <h2 className="text-xl font-light text-ink">Broker Directory</h2>
          <p className="mt-1 text-sm text-mute">These brokers appear in every user’s Client Intake drawer. Selection order determines the primary broker.</p>
          {loading ? <p className="mt-4 text-sm text-mute">Loading…</p> : brokers.length === 0 ? <p className="mt-4 text-sm text-mute">No brokers have been created.</p> : (
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {brokers.map((broker) => (
                <article key={broker.id} className="flex items-center justify-between gap-3 rounded-2xl border border-line p-4">
                  <div>
                    <p className="font-medium text-ink">{broker.name}</p>
                    <p className="mt-1 text-sm text-mute">{broker.firmName ?? 'Firm not set'} · {broker.email}</p>
                    {broker.representativeCrdNumber && <p className="mt-1 text-xs text-mute">Representative CRD {broker.representativeCrdNumber}</p>}
                    {broker.repCode && <p className="mt-1 text-xs text-mute">Rep Code {broker.repCode}</p>}
                  </div>
                  <button className="text-xs uppercase tracking-[0.14em] text-accent" type="button" onClick={() => editBroker(broker)}>Edit</button>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
