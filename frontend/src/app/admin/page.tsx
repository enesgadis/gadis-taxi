'use client';

import React, { useState, useEffect } from 'react';
import { API_URL } from '@/lib/api';

interface ComplaintItem {
  id: number;
  category: string;
  severity: number;
  status: 'open' | 'in_progress' | 'resolved' | 'rejected';
  raw_text: string;
  ai_summary?: string;
  ai_reply?: string;
  suggested_action?: string;
  channel: string;
  created_at: string;
  passenger?: { id: number; name: string; phone: string };
  driver?: { id: number; name: string; plate: string; phone: string };
  ride?: { id: number; status: string; distance_km?: number; eta_minutes?: number };
}

interface AIRecommendation {
  decision: 'resolved' | 'rejected';
  refund_suggested: boolean;
  refund_amount_tl: number;
  driver_warning: string;
  passenger_message: string;
  reasoning: string;
}

export default function AdminComplaintsPage() {
  const [token, setToken] = useState<string>('');
  const [authed, setAuthed] = useState<boolean>(false);
  const [passInput, setPassInput] = useState<string>('');
  const [complaints, setComplaints] = useState<ComplaintItem[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [selected, setSelected] = useState<ComplaintItem | null>(null);
  const [adminNote, setAdminNote] = useState<string>('');
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiRec, setAiRec] = useState<AIRecommendation | null>(null);
  const [actionMsg, setActionMsg] = useState<string>('');

  useEffect(() => {
    const saved = localStorage.getItem('gadis_admin_key');
    if (saved) {
      setToken(saved);
      fetchComplaints(saved);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('gadis_admin_key', passInput);
    setToken(passInput);
    fetchComplaints(passInput);
  };

  const handleLogout = () => {
    localStorage.removeItem('gadis_admin_key');
    setToken('');
    setAuthed(false);
    setComplaints([]);
  };

  const fetchComplaints = async (adminKey: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/complaints`, {
        headers: { 'X-Admin-Token': adminKey }
      });
      if (res.ok) {
        const data = await res.json();
        setComplaints(data.complaints || []);
        setStats(data.stats || null);
        setAuthed(true);
      } else {
        alert('Hatalı Yönetici Şifresi! Lütfen tekrar deneyin.');
        setAuthed(false);
      }
    } catch (err) {
      alert('Backend bağlantı hatası: ' + err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (c: ComplaintItem) => {
    setSelected(c);
    setAiRec(null);
    setAdminNote('');
    setActionMsg('');
  };

  const handleAIAnalyze = async () => {
    if (!selected) return;
    setAiLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/complaints/${selected.id}/ai_resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': token
        }
      });
      const data = await res.json();
      if (res.ok && data.ai_recommendation) {
        setAiRec(data.ai_recommendation);
        if (data.ai_recommendation.passenger_message) {
          setAdminNote(data.ai_recommendation.passenger_message);
        }
      } else {
        alert('AI analiz yanıtı alınamadı.');
      }
    } catch (err) {
      alert('AI analiz hatası: ' + err);
    } finally {
      setAiLoading(false);
    }
  };

  const handleUpdateStatus = async (status: 'resolved' | 'rejected' | 'in_progress') => {
    if (!selected) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/complaints/${selected.id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': token
        },
        body: JSON.stringify({ status, admin_note: adminNote })
      });
      if (res.ok) {
        setActionMsg(`✅ Şikayet başarıyla "${status}" yapıldı ve ilgili taraflara (yolcu/şoför) Telegram bildirimi gönderildi!`);
        fetchComplaints(token);
        setSelected((prev) => prev ? { ...prev, status } : null);
      } else {
        alert('Güncelleme başarısız oldu.');
      }
    } catch (err) {
      alert('Hata: ' + err);
    }
  };

  if (!authed) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#090d16',
        color: '#f8fafc',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }}>
        <div style={{
          width: '100%',
          maxWidth: 420,
          background: 'rgba(30, 41, 59, 0.7)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 20,
          padding: 32,
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🛡️</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, letterSpacing: '-0.5px' }}>
            Gadis Yönetici Masası
          </h2>
          <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 24 }}>
            Şikayet Yönetimi & Otonom AI Hakemlik Masası
          </p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input
              type="password"
              placeholder="Yönetici Şifrenizi Girin"
              value={passInput}
              onChange={(e) => setPassInput(e.target.value)}
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: 12,
                background: '#0f172a',
                border: '1px solid #334155',
                color: '#fff',
                fontSize: 14,
                outline: 'none'
              }}
              required
            />
            <button
              type="submit"
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: 12,
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: '#fff',
                fontWeight: 700,
                fontSize: 14,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)'
              }}
            >
              Giriş Yap
            </button>
          </form>
          <div style={{ marginTop: 16, fontSize: 11, color: '#64748b' }}>
            Varsayılan Şifre: <code>gadis2026</code>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#090d16', color: '#f8fafc', padding: 24 }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(30, 41, 59, 0.5)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 16,
        padding: '16px 24px',
        marginBottom: 24
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 28 }}>🛡️</span>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800 }}>Gadis Taxi AI-Native Şikayet & Hakem Masası</h1>
            <p style={{ fontSize: 12, color: '#94a3b8' }}>Müşteri-şoför uyuşmazlıkları Gemini AI hakemliği ile çözümlenir</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => fetchComplaints(token)}
            style={{
              padding: '8px 16px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#cbd5e1',
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            🔄 Yenile
          </button>
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 16px',
              borderRadius: 10,
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            Çıkış
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
          <div style={{ background: '#1e293b', padding: 16, borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Toplam Dosya</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }}>{stats.total}</div>
          </div>
          <div style={{ background: '#1e293b', padding: 16, borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 12, color: '#38bdf8', textTransform: 'uppercase', fontWeight: 700 }}>İncelemede (Açık)</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#38bdf8', marginTop: 4 }}>{stats.open}</div>
          </div>
          <div style={{ background: '#1e293b', padding: 16, borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 12, color: '#ef4444', textTransform: 'uppercase', fontWeight: 700 }}>Yüksek Öncelik (4-5)</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#ef4444', marginTop: 4 }}>{stats.critical}</div>
          </div>
          <div style={{ background: '#1e293b', padding: 16, borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 12, color: '#10b981', textTransform: 'uppercase', fontWeight: 700 }}>Onaylandı & Çözüldü</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#10b981', marginTop: 4 }}>{stats.resolved}</div>
          </div>
          <div style={{ background: '#1e293b', padding: 16, borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 12, color: '#f59e0b', textTransform: 'uppercase', fontWeight: 700 }}>Reddedilen</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#f59e0b', marginTop: 4 }}>{stats.rejected}</div>
          </div>
        </div>
      )}

      {/* Main Grid: List + Detail */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: 24 }}>
        {/* Left: Complaints List */}
        <div style={{
          background: 'rgba(30, 41, 59, 0.4)',
          borderRadius: 16,
          border: '1px solid rgba(255, 255, 255, 0.08)',
          padding: 16,
          maxHeight: '75vh',
          overflowY: 'auto'
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: '#cbd5e1' }}>
            📋 Şikayet Dosyaları ({complaints.length})
          </h2>

          {complaints.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
              Henüz kayıtlı şikayet dosyası bulunmuyor.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {complaints.map((c) => {
                const isSel = selected?.id === c.id;
                const statusColor =
                  c.status === 'resolved' ? '#10b981' :
                  c.status === 'rejected' ? '#f59e0b' :
                  c.status === 'in_progress' ? '#38bdf8' : '#ef4444';

                return (
                  <div
                    key={c.id}
                    onClick={() => handleSelect(c)}
                    style={{
                      padding: 14,
                      borderRadius: 12,
                      background: isSel ? 'rgba(37, 99, 235, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                      border: isSel ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.05)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontWeight: 800, fontSize: 13 }}>
                        Dosya #{c.id} • {c.category.toUpperCase()}
                      </span>
                      <span style={{
                        fontSize: 11,
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: `${statusColor}22`,
                        color: statusColor,
                        fontWeight: 700
                      }}>
                        {c.status.toUpperCase()}
                      </span>
                    </div>

                    <div style={{ fontSize: 13, color: '#e2e8f0', marginBottom: 6, lineClamp: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      "{c.raw_text}"
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
                      <span>👤 {c.passenger?.name || 'Yolcu'}</span>
                      <span>🚖 {c.driver?.name || 'Şoför Belirsiz'}</span>
                      <span style={{ color: c.severity >= 4 ? '#ef4444' : '#f59e0b', fontWeight: 700 }}>
                        Önem: {c.severity}/5
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Detailed Card & AI Hakemlik Masası */}
        <div style={{
          background: 'rgba(30, 41, 59, 0.4)',
          borderRadius: 16,
          border: '1px solid rgba(255, 255, 255, 0.08)',
          padding: 24
        }}>
          {selected ? (
            <div>
              {/* Header Info */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 16, marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: 20, fontWeight: 800 }}>
                    Şikayet Vaka Detayı: #{selected.id}
                  </h3>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                    Kayıt Zamanı: {new Date(selected.created_at).toLocaleString('tr-TR')} • Kanal: {selected.channel}
                  </div>
                </div>

                <button
                  onClick={handleAIAnalyze}
                  disabled={aiLoading}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 13,
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(139, 92, 246, 0.3)'
                  }}
                >
                  {aiLoading ? '🧠 Gemini İnceliyor...' : '🤖 AI Otonom Hakemlik Çalıştır'}
                </button>
              </div>

              {/* Taraflar Kartı */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                <div style={{ background: '#0f172a', padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Yolcu Bilgisi</div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>{selected.passenger?.name || 'Bilinmiyor'}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Tel: {selected.passenger?.phone || '-'}</div>
                </div>

                <div style={{ background: '#0f172a', padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>İlgili Şoför & Plaka</div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>
                    {selected.driver ? `${selected.driver.name} (${selected.driver.plate})` : 'Eşleşen şoför yok'}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Tel: {selected.driver?.phone || '-'}</div>
                </div>
              </div>

              {/* Vaka Metni */}
              <div style={{ background: '#0f172a', padding: 16, borderRadius: 12, marginBottom: 16, border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>
                  💬 Müşteri Şikayet İfadesi
                </div>
                <div style={{ fontSize: 15, color: '#f1f5f9', fontStyle: 'italic', lineHeight: 1.5 }}>
                  "{selected.raw_text}"
                </div>
              </div>

              {/* AI Recommendation Box */}
              {aiRec && (
                <div style={{
                  background: 'rgba(139, 92, 246, 0.12)',
                  border: '1px solid rgba(139, 92, 246, 0.4)',
                  borderRadius: 14,
                  padding: 18,
                  marginBottom: 16
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#c084fc', fontWeight: 800, fontSize: 14, marginBottom: 8 }}>
                    <span>🧠 Gemini AI Hakem Kararı & Raporu</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#e2e8f0', marginBottom: 10, lineHeight: 1.5 }}>
                    <strong>Gerekçe:</strong> {aiRec.reasoning}
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#cbd5e1', marginBottom: 10 }}>
                    <span>Öneri: <strong style={{ color: aiRec.decision === 'resolved' ? '#10b981' : '#f59e0b' }}>{aiRec.decision.toUpperCase()}</strong></span>
                    {aiRec.refund_suggested && (
                      <span style={{ color: '#10b981', fontWeight: 700 }}>
                        💰 İade Tutarı: {aiRec.refund_amount_tl} TL
                      </span>
                    )}
                  </div>
                  {aiRec.driver_warning && (
                    <div style={{ fontSize: 12, color: '#fca5a5' }}>
                      ⚠️ <strong>Şoför Notu:</strong> {aiRec.driver_warning}
                    </div>
                  )}
                </div>
              )}

              {/* Resolution Form */}
              <div style={{ marginTop: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>
                  📝 Yolcuya / Şoföre İletilecek Yönetici Karar Notu:
                </label>
                <textarea
                  rows={3}
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Yolcuya gidecek sonuç açıklamasını yazın..."
                  style={{
                    width: '100%',
                    padding: 12,
                    borderRadius: 10,
                    background: '#0f172a',
                    border: '1px solid #334155',
                    color: '#fff',
                    fontSize: 13,
                    outline: 'none',
                    resize: 'vertical',
                    marginBottom: 14
                  }}
                />

                {actionMsg && (
                  <div style={{ padding: 12, borderRadius: 8, background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', color: '#34d399', fontSize: 13, marginBottom: 14 }}>
                    {actionMsg}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    onClick={() => handleUpdateStatus('resolved')}
                    style={{
                      flex: 1,
                      padding: 12,
                      borderRadius: 10,
                      background: '#10b981',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: 13,
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    ✅ Onayla & Çöz (Yolcu Haklı)
                  </button>

                  <button
                    onClick={() => handleUpdateStatus('rejected')}
                    style={{
                      flex: 1,
                      padding: 12,
                      borderRadius: 10,
                      background: '#f59e0b',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: 13,
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    ❌ Reddet (Haksız Talep)
                  </button>

                  <button
                    onClick={() => handleUpdateStatus('in_progress')}
                    style={{
                      padding: '12px 18px',
                      borderRadius: 10,
                      background: 'rgba(56, 189, 248, 0.2)',
                      border: '1px solid rgba(56, 189, 248, 0.4)',
                      color: '#38bdf8',
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: 'pointer'
                    }}
                  >
                    ⏳ İncelemeye Al
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>👈</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>İncelemek için soldaki listeden bir şikayet seçin.</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Gemini ile vaka analizini tek tıkla çalıştırıp karar verebilirsiniz.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
