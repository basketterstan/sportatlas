import React, { useState } from 'react';
import { db } from '../../utils/firebase';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { UserProfile } from '../../types';

interface TshirtClaimModalProps {
  userProfile: UserProfile;
  onClose: () => void;
}

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

const TshirtClaimModal: React.FC<TshirtClaimModalProps> = ({ userProfile, onClose }) => {
  const [form, setForm] = useState({
    name: userProfile.name || '',
    street: '',
    city: '',
    zip: '',
    country: '',
    size: 'L',
  });
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.street || !form.city || !form.zip || !form.country) {
      setError('Vul alle velden in.');
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'tshirt_claims'), {
        uid: userProfile.uid,
        name: form.name,
        email: userProfile.email,
        street: form.street,
        city: form.city,
        zip: form.zip,
        country: form.country,
        size: form.size,
        plan: userProfile.plan,
        billingPeriod: userProfile.billingPeriod,
        claimedAt: Date.now(),
      });
      if (userProfile.uid) {
        await updateDoc(doc(db, 'users', userProfile.uid), { tshirtAddressSubmitted: true });
      }
      setSubmitted(true);
    } catch {
      setError('Er ging iets mis. Probeer opnieuw.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-ha-surface border border-ha-line rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {submitted ? (
          <div className="p-8 text-center">
            <div className="text-4xl mb-3">🎉</div>
            <h2 className="text-xl font-bold text-ha-textHi mb-2">Adres ontvangen!</h2>
            <p className="text-ha-textMid text-sm mb-6">
              We sturen je SportAtlas T-shirt zo snel mogelijk op. Bedankt voor je support!
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-ha-brand text-white rounded-ha-md font-medium hover:opacity-90 transition-opacity"
            >
              Sluiten
            </button>
          </div>
        ) : (
          <>
            <div className="relative bg-ha-surface2 flex justify-center pt-6 pb-4 px-6">
              <img
                src="/tshirt-promo.png"
                alt="Gratis SportAtlas T-shirt"
                className="h-44 object-contain"
              />
              <button
                onClick={onClose}
                className="absolute top-3 right-3 text-ha-textLow hover:text-ha-textHi transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="px-6 pt-4 pb-2">
              <div className="inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-500 text-xs font-semibold px-2.5 py-1 rounded-full mb-3">
                🎁 Actie: Jaarlijks Pro — Juli 2026
              </div>
              <h2 className="text-lg font-bold text-ha-textHi mb-1">Jij krijgt een gratis T-shirt!</h2>
              <p className="text-ha-textMid text-sm mb-4">
                Als bedanking voor jouw jaarlijks Pro-abonnement sturen we je een exclusief SportAtlas shirt. Vul je bezorgadres in.
              </p>

              <div className="bg-ha-surface2 border border-ha-line rounded-xl p-3 text-[11px] text-ha-textMid leading-relaxed mb-4">
                <p className="font-semibold text-ha-textHi mb-1">Actievoorwaarden</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Enkel geldig voor <strong>jaarlijkse Pro-abonnementen</strong> afgesloten in <strong>juli 2026</strong></li>
                  <li>Uitsluitend voor gebruikers met een bezorgadres <strong>binnen Europa</strong></li>
                  <li>Eén shirt per account, niet overdraagbaar</li>
                  <li>Verzending binnen 4 weken na bevestiging van het adres</li>
                  <li>Zolang de voorraad strekt</li>
                  <li>SportAtlas behoudt het recht de actie te beëindigen</li>
                </ul>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-3">
              <div>
                <label className="block text-xs font-medium text-ha-textMid mb-1">Naam</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-ha-surface2 border border-ha-line rounded-ha-md px-3 py-2 text-sm text-ha-textHi focus:outline-none focus:border-ha-brand"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ha-textMid mb-1">Straat + huisnummer</label>
                <input
                  type="text"
                  value={form.street}
                  onChange={e => setForm(f => ({ ...f, street: e.target.value }))}
                  className="w-full bg-ha-surface2 border border-ha-line rounded-ha-md px-3 py-2 text-sm text-ha-textHi focus:outline-none focus:border-ha-brand"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-ha-textMid mb-1">Postcode</label>
                  <input
                    type="text"
                    value={form.zip}
                    onChange={e => setForm(f => ({ ...f, zip: e.target.value }))}
                    className="w-full bg-ha-surface2 border border-ha-line rounded-ha-md px-3 py-2 text-sm text-ha-textHi focus:outline-none focus:border-ha-brand"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ha-textMid mb-1">Stad</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                    className="w-full bg-ha-surface2 border border-ha-line rounded-ha-md px-3 py-2 text-sm text-ha-textHi focus:outline-none focus:border-ha-brand"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-ha-textMid mb-1">Land</label>
                  <input
                    type="text"
                    value={form.country}
                    onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                    className="w-full bg-ha-surface2 border border-ha-line rounded-ha-md px-3 py-2 text-sm text-ha-textHi focus:outline-none focus:border-ha-brand"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ha-textMid mb-1">Maat</label>
                  <select
                    value={form.size}
                    onChange={e => setForm(f => ({ ...f, size: e.target.value }))}
                    className="w-full bg-ha-surface2 border border-ha-line rounded-ha-md px-3 py-2 text-sm text-ha-textHi focus:outline-none focus:border-ha-brand"
                  >
                    {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {error && <p className="text-red-400 text-xs">{error}</p>}

              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 bg-ha-brand text-white rounded-ha-md font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 mt-1"
              >
                {saving ? 'Verzenden…' : 'Adres bevestigen →'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default TshirtClaimModal;
