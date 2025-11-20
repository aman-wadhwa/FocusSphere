import { useState, useEffect } from 'react';
import axios from 'axios';

// const API_URL = "http://127.0.0.1:5000";
const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:5000";

const apiClient = axios.create({ baseURL: API_URL });
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function StudyStats() {
  const [stats, setStats] = useState(null);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // overview, history, leaderboard, gamification
  const [leaderboard, setLeaderboard] = useState(null);
  const [leaderboardPeriod, setLeaderboardPeriod] = useState('weekly'); // weekly, monthly
  const [gamificationStats, setGamificationStats] = useState(null);

  useEffect(() => {
    fetchStats();
    fetchSessionHistory();
    fetchGamificationStats();
  }, []);

  useEffect(() => {
    if (activeTab === 'leaderboard') {
      fetchLeaderboard();
    }
  }, [activeTab, leaderboardPeriod]);

  const fetchStats = async () => {
    try {
      const response = await apiClient.get('/api/stats');
      setStats(response.data);
      setLoading(false);
    } catch (err) {
      setError('Failed to load statistics');
      setLoading(false);
    }
  };

  const fetchSessionHistory = async () => {
    try {
      const response = await apiClient.get('/api/sessions/history?limit=20');
      setSessionHistory(response.data.sessions);
    } catch (err) {
      console.error('Failed to load session history:', err);
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const endpoint = leaderboardPeriod === 'weekly' ? '/api/leaderboard/weekly' : '/api/leaderboard/monthly';
      const response = await apiClient.get(endpoint);
      setLeaderboard(response.data);
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
    }
  };

  const fetchGamificationStats = async () => {
    try {
      const response = await apiClient.get('/api/gamification/stats');
      setGamificationStats(response.data);
      // Show notification for new achievements
      if (response.data.new_achievements && response.data.new_achievements.length > 0) {
        response.data.new_achievements.forEach(ach => {
          setTimeout(() => {
            alert(`🎉 Achievement Unlocked!\n\n${ach.icon} ${ach.name}\n${ach.description}`);
          }, 1000);
        });
      }
    } catch (err) {
      console.error('Failed to load gamification stats:', err);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getDayName = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  };

  if (loading) {
    return <div className="stats-container">Loading statistics...</div>;
  }

  if (error) {
    return <div className="stats-container error">{error}</div>;
  }

  if (!stats) {
    return <div className="stats-container">No statistics available</div>;
  }

  const maxDailyDuration = Math.max(...stats.daily_stats.map(d => d.study_time || d.session_duration || 0), 1);

  return (
    <div className="stats-container">
      <div className="stats-header">
        <h2>Study Statistics</h2>
        <div className="stats-tabs">
          <button 
            className={activeTab === 'overview' ? 'active' : ''}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button 
            className={activeTab === 'history' ? 'active' : ''}
            onClick={() => setActiveTab('history')}
          >
            History
          </button>
          <button 
            className={activeTab === 'leaderboard' ? 'active' : ''}
            onClick={() => setActiveTab('leaderboard')}
          >
            Leaderboard
          </button>
          <button 
            className={activeTab === 'gamification' ? 'active' : ''}
            onClick={() => setActiveTab('gamification')}
          >
            Achievements
          </button>
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="stats-overview">
          {/* Overall Statistics */}
          <div className="stats-section">
            <h3>Overall Statistics</h3>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">{stats.overall.total_sessions}</div>
                <div className="stat-label">Total Sessions</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.overall.total_study_time_formatted || stats.overall.total_duration_formatted}</div>
                <div className="stat-label">Total Study Time</div>
                <div className="stat-subvalue" style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.25rem' }}>
                  Timer Running Time
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.overall.total_session_duration_formatted || stats.overall.total_duration_formatted}</div>
                <div className="stat-label">Total Session Length</div>
                <div className="stat-subvalue" style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.25rem' }}>
                  Total Time in Sessions
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.overall.total_pomodoros}</div>
                <div className="stat-label">Total Pomodoros</div>
              </div>
            </div>
          </div>

          {/* Today's Statistics */}
          <div className="stats-section">
            <h3>Today's Statistics</h3>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">{stats.today?.sessions || 0}</div>
                <div className="stat-label">Sessions Today</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.today?.study_time_formatted || '0m'}</div>
                <div className="stat-label">Study Time Today</div>
                <div className="stat-subvalue" style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.25rem' }}>
                  Timer Running Time
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.today?.session_duration_formatted || '0m'}</div>
                <div className="stat-label">Session Length Today</div>
                <div className="stat-subvalue" style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.25rem' }}>
                  Total Time in Sessions
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.today?.pomodoros || 0}</div>
                <div className="stat-label">Pomodoros Today</div>
              </div>
            </div>
          </div>

          {/* Last 7 Days Statistics */}
          <div className="stats-section">
            <h3>Last 7 Days Statistics</h3>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">{stats.weekly.sessions}</div>
                <div className="stat-label">Sessions (7 Days)</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.weekly.study_time_formatted || stats.weekly.duration_formatted}</div>
                <div className="stat-label">Study Time (7 Days)</div>
                <div className="stat-subvalue" style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.25rem' }}>
                  Timer Running Time
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.weekly.session_duration_formatted || stats.weekly.duration_formatted}</div>
                <div className="stat-label">Session Length (7 Days)</div>
                <div className="stat-subvalue" style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.25rem' }}>
                  Total Time in Sessions
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.weekly.pomodoros}</div>
                <div className="stat-label">Pomodoros (7 Days)</div>
              </div>
            </div>
          </div>

          {/* Daily Activity Chart */}
          <div className="stats-section">
            <h3>Daily Activity (Last 7 Days)</h3>
            <div className="daily-chart">
              {stats.daily_stats.map((day, index) => (
                <div key={index} className="daily-bar-container">
                  <div className="daily-bar-wrapper">
                    <div 
                      className="daily-bar"
                      style={{ 
                        height: `${((day.study_time || day.session_duration || 0) / maxDailyDuration) * 100}%`,
                        minHeight: (day.study_time || day.session_duration || 0) > 0 ? '5px' : '0'
                      }}
                      title={`Study: ${Math.floor((day.study_time || 0) / 60)}m, Session: ${Math.floor((day.session_duration || 0) / 60)}m`}
                    />
                  </div>
                  <div className="daily-label">{getDayName(day.date)}</div>
                  <div className="daily-sessions">{day.sessions}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Study Goals Breakdown */}
          {stats.goals_breakdown.length > 0 && (
            <div className="stats-section">
              <h3>Study Goals Breakdown</h3>
              <div className="goals-list">
                {stats.goals_breakdown.map((goal, index) => (
                  <div key={index} className="goal-item">
                    <div className="goal-header">
                      <span className="goal-text">{goal.goal}</span>
                      <span className="goal-count">{goal.session_count} sessions</span>
                    </div>
                    <div className="goal-duration">{goal.duration_formatted}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="stats-history">
          <h3>Session History</h3>
          {sessionHistory.length === 0 ? (
            <p className="no-sessions">No study sessions yet. Start studying to see your history!</p>
          ) : (
            <div className="history-list">
              {sessionHistory.map((session) => (
                <div key={session.session_id} className="history-item">
                  <div className="history-header">
                    <div className="history-date">{formatDate(session.start_time)}</div>
                    <div className="history-status">{session.status}</div>
                  </div>
                  {session.study_goal && (
                    <div className="history-goal">{session.study_goal}</div>
                  )}
                  <div className="history-details">
                    {session.partner_name && (
                      <span className="history-partner">With: {session.partner_name}</span>
                    )}
                    <span className="history-duration">{session.duration_formatted}</span>
                    {session.pomodoro_count > 0 && (
                      <span className="history-pomodoros">{session.pomodoro_count} pomodoros</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'leaderboard' && (
        <div className="stats-leaderboard">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3>Leaderboard</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setLeaderboardPeriod('weekly')}
                style={{
                  padding: '0.5rem 1rem',
                  background: leaderboardPeriod === 'weekly' ? '#667eea' : '#f0f0f0',
                  color: leaderboardPeriod === 'weekly' ? 'white' : '#333',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Weekly
              </button>
              <button
                onClick={() => setLeaderboardPeriod('monthly')}
                style={{
                  padding: '0.5rem 1rem',
                  background: leaderboardPeriod === 'monthly' ? '#667eea' : '#f0f0f0',
                  color: leaderboardPeriod === 'monthly' ? 'white' : '#333',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Monthly
              </button>
            </div>
          </div>

          {leaderboard ? (
            <>
              {leaderboard.current_user_rank && (
                <div style={{
                  padding: '1rem',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  borderRadius: '8px',
                  marginBottom: '1.5rem',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>Your Rank</div>
                  <div style={{ fontSize: '2rem', fontWeight: '700' }}>#{leaderboard.current_user_rank}</div>
                </div>
              )}

              {leaderboard.leaderboard && leaderboard.leaderboard.length > 0 ? (
                <div className="leaderboard-list">
                  {leaderboard.leaderboard.map((entry, index) => (
                    <div
                      key={entry.user_id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '1rem',
                        marginBottom: '0.5rem',
                        background: entry.is_current_user ? 'rgba(102, 126, 234, 0.1)' : 'rgba(255, 255, 255, 0.8)',
                        borderRadius: '8px',
                        border: entry.is_current_user ? '2px solid #667eea' : '1px solid #e0e0e0'
                      }}
                    >
                      <div style={{
                        width: '40px',
                        height: '40px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '50%',
                        background: index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : index === 2 ? '#CD7F32' : '#f0f0f0',
                        color: index < 3 ? 'white' : '#333',
                        fontWeight: '700',
                        fontSize: '1.1rem',
                        marginRight: '1rem'
                      }}>
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : entry.rank}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '600', fontSize: '1.1rem', marginBottom: '0.25rem' }}>
                          {entry.name} {entry.is_current_user && '(You)'}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#666' }}>
                          {entry.study_time_formatted} • {entry.sessions} sessions • {entry.pomodoros} pomodoros
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>
                  No leaderboard data available yet. Start studying to appear on the leaderboard!
                </p>
              )}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem' }}>Loading leaderboard...</div>
          )}
        </div>
      )}

      {activeTab === 'gamification' && (
        <div className="stats-gamification">
          <h3>Your Progress</h3>
          
          {gamificationStats ? (
            <div>
              {/* Points and Streaks */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                <div style={{
                  padding: '1.5rem',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  borderRadius: '12px',
                  color: 'white',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '0.9rem', opacity: 0.9, marginBottom: '0.5rem' }}>Total Points</div>
                  <div style={{ fontSize: '2.5rem', fontWeight: '700' }}>{gamificationStats.points || 0}</div>
                </div>
                <div style={{
                  padding: '1.5rem',
                  background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                  borderRadius: '12px',
                  color: 'white',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '0.9rem', opacity: 0.9, marginBottom: '0.5rem' }}>Current Streak</div>
                  <div style={{ fontSize: '2.5rem', fontWeight: '700' }}>{gamificationStats.current_streak || 0} 🔥</div>
                </div>
                <div style={{
                  padding: '1.5rem',
                  background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                  borderRadius: '12px',
                  color: 'white',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '0.9rem', opacity: 0.9, marginBottom: '0.5rem' }}>Longest Streak</div>
                  <div style={{ fontSize: '2.5rem', fontWeight: '700' }}>{gamificationStats.longest_streak || 0}</div>
                </div>
              </div>

              {/* Achievements */}
              <h3 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Achievements</h3>
              {gamificationStats.achievements && gamificationStats.achievements.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                  {gamificationStats.achievements.map((ach) => (
                    <div
                      key={ach.id}
                      style={{
                        padding: '1.5rem',
                        background: 'rgba(255, 255, 255, 0.9)',
                        borderRadius: '12px',
                        border: '2px solid #667eea',
                        textAlign: 'center',
                        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                      }}
                    >
                      <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>{ach.icon}</div>
                      <div style={{ fontWeight: '600', fontSize: '1.1rem', marginBottom: '0.25rem' }}>{ach.name}</div>
                      <div style={{ fontSize: '0.85rem', color: '#666' }}>{ach.description}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>
                  No achievements unlocked yet. Keep studying to unlock achievements!
                </p>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem' }}>Loading gamification stats...</div>
          )}
        </div>
      )}
    </div>
  );
}

export default StudyStats;


