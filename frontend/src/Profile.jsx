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

function Profile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');
  
  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [preferredSessionLength, setPreferredSessionLength] = useState('medium');
  const [studyStyle, setStudyStyle] = useState('flexible');
  const [timezone, setTimezone] = useState('');
  const [similarityThreshold, setSimilarityThreshold] = useState(0.3);
  const [university, setUniversity] = useState('');
  const [location, setLocation] = useState('');
  
  // Friends management states
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState({ received: [], sent: [] });
  const [friendEmail, setFriendEmail] = useState('');
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [friendOnlineStatus, setFriendOnlineStatus] = useState({}); // { friend_id: is_online }
  
  // Password change states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await apiClient.get('/api/profile');
      const userDetails = response.data.user_details;
      setProfile(userDetails);
      
      // Populate form fields
      setName(userDetails.name);
      setEmail(userDetails.email);
      setPreferredSessionLength(userDetails.preferred_session_length || 'medium');
      setStudyStyle(userDetails.study_style || 'flexible');
      setTimezone(userDetails.timezone || '');
      setSimilarityThreshold(userDetails.minimum_similarity_threshold || 0.3);
      setUniversity(userDetails.university || '');
      setLocation(userDetails.location || '');
      
      // Fetch friends and requests
      fetchFriends();
      fetchFriendRequests();
      
      setLoading(false);
    } catch (err) {
      setError('Failed to load profile');
      setLoading(false);
    }
  };

  const fetchFriends = async () => {
    try {
      const response = await apiClient.get('/api/friends');
      setFriends(response.data.friends || []);
      
      // Check online status for all friends
      const statusMap = {};
      for (const friend of response.data.friends || []) {
        try {
          const statusResponse = await apiClient.get(`/api/users/online?user_id=${friend.user_id}`);
          statusMap[friend.user_id] = statusResponse.data.is_online;
        } catch (err) {
          statusMap[friend.user_id] = false;
        }
      }
      setFriendOnlineStatus(statusMap);
    } catch (err) {
      console.error('Failed to load friends:', err);
    }
  };
  
  const handleInviteFriend = async (friendId, friendName) => {
    try {
      // Generate a room ID
      const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const response = await apiClient.post('/api/match/invite-friend', {
        friend_id: friendId,
        room_id: roomId
      });
      
      setMessage(`Invitation sent to ${friendName}!`);
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(`Error: ${error.response?.data?.error || 'Could not send invitation'}`);
    }
  };

  const fetchFriendRequests = async () => {
    try {
      const response = await apiClient.get('/api/friends/requests');
      setFriendRequests({
        received: response.data.received_requests || [],
        sent: response.data.sent_requests || []
      });
    } catch (err) {
      console.error('Failed to load friend requests:', err);
    }
  };

  const handleSendFriendRequest = async (e) => {
    e.preventDefault();
    if (!friendEmail.trim()) {
      setMessage('Error: Please enter an email address');
      return;
    }
    
    setMessage('Sending friend request...');
    try {
      await apiClient.post('/api/friends/send-request', { email: friendEmail.trim() });
      setMessage('Friend request sent successfully!');
      setFriendEmail('');
      setShowAddFriend(false);
      fetchFriendRequests();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(`Error: ${error.response?.data?.error || 'Could not send friend request'}`);
    }
  };

  const handleAcceptRequest = async (requestId) => {
    setMessage('Accepting friend request...');
    try {
      await apiClient.post('/api/friends/accept-request', { request_id: requestId });
      setMessage('Friend request accepted!');
      fetchFriends();
      fetchFriendRequests();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(`Error: ${error.response?.data?.error || 'Could not accept friend request'}`);
    }
  };

  const handleDeclineRequest = async (requestId) => {
    setMessage('Declining friend request...');
    try {
      await apiClient.post('/api/friends/decline-request', { request_id: requestId });
      setMessage('Friend request declined');
      fetchFriendRequests();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(`Error: ${error.response?.data?.error || 'Could not decline friend request'}`);
    }
  };

  const handleRemoveFriend = async (friendId) => {
    if (!window.confirm('Are you sure you want to remove this friend?')) {
      return;
    }
    
    setMessage('Removing friend...');
    try {
      await apiClient.post('/api/friends/remove', { friend_id: friendId });
      setMessage('Friend removed successfully!');
      fetchFriends();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(`Error: ${error.response?.data?.error || 'Could not remove friend'}`);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setMessage('Updating profile...');
    
    try {
      const response = await apiClient.put('/api/profile', {
        name,
        email,
        preferred_session_length: preferredSessionLength,
        study_style: studyStyle,
        timezone: timezone || undefined,
        minimum_similarity_threshold: similarityThreshold,
        university: university || undefined,
        location: location || undefined
      });
      
      setProfile(response.data.user_details);
      setMessage('Profile updated successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(`Error: ${error.response?.data?.error || 'Could not update profile'}`);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      setMessage('Error: New passwords do not match');
      return;
    }
    
    if (newPassword.length < 6) {
      setMessage('Error: New password must be at least 6 characters long');
      return;
    }
    
    setMessage('Changing password...');
    
    try {
      await apiClient.post('/api/profile/change-password', {
        current_password: currentPassword,
        new_password: newPassword
      });
      
      setMessage('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordForm(false);
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(`Error: ${error.response?.data?.error || 'Could not change password'}`);
    }
  };

  if (loading) {
    return <div className="profile-container">Loading profile...</div>;
  }

  if (error) {
    return <div className="profile-container error">{error}</div>;
  }

  if (!profile) {
    return <div className="profile-container">No profile data available</div>;
  }

  return (
    <div className="profile-container">
      <h2>My Profile</h2>
      
      {message && (
        <div className={`profile-message ${message.includes('Error') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}

      {/* Profile Information Section */}
      <div className="profile-section">
        <h3>Profile Information</h3>
        <form onSubmit={handleUpdateProfile} className="profile-form">
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Preferred Session Length</label>
              <select
                value={preferredSessionLength}
                onChange={(e) => setPreferredSessionLength(e.target.value)}
              >
                <option value="short">Short (30-60 min)</option>
                <option value="medium">Medium (1-2 hours)</option>
                <option value="long">Long (2+ hours)</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Study Style</label>
              <select
                value={studyStyle}
                onChange={(e) => setStudyStyle(e.target.value)}
              >
                <option value="focused">Focused (Quiet, Independent)</option>
                <option value="collaborative">Collaborative (Discussion, Group Work)</option>
                <option value="flexible">Flexible (Adaptable)</option>
              </select>
            </div>
          </div>
          
          <div className="form-group">
            <label>Timezone (Optional)</label>
            <input
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="e.g., UTC-5, EST, PST"
            />
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>University/School (Optional)</label>
              <input
                type="text"
                value={university}
                onChange={(e) => setUniversity(e.target.value)}
                placeholder="e.g., MIT, Stanford University"
              />
              <small style={{ color: '#666', fontSize: '0.85rem' }}>
                Share your university to get trust bonus when matching with students from the same school
              </small>
            </div>
            
            <div className="form-group">
              <label>Location (Optional)</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., New York, NY or London, UK"
              />
              <small style={{ color: '#666', fontSize: '0.85rem' }}>
                Share your location to get trust bonus when matching with users nearby
              </small>
            </div>
          </div>
          
          <div className="form-group">
            <label>Minimum Similarity Threshold: {similarityThreshold.toFixed(2)}</label>
            <input
              type="range"
              min="0.1"
              max="0.9"
              step="0.05"
              value={similarityThreshold}
              onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
            />
            <div className="range-labels">
              <span>More Flexible (0.1)</span>
              <span>More Strict (0.9)</span>
            </div>
          </div>
          
          <button type="submit" className="update-btn">Update Profile</button>
        </form>
      </div>

      {/* Friends Management Section */}
      <div className="profile-section">
        <h3>Friends ({friends.length})</h3>
        <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1rem' }}>
          Add friends to get trust bonus when matching! Mutual friends increase your match score.
        </p>
        
        {/* Friend Requests - Received */}
        {friendRequests.received.length > 0 && (
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(102, 126, 234, 0.1)', borderRadius: '8px', border: '1px solid #667eea' }}>
            <h4 style={{ marginTop: 0, marginBottom: '0.75rem', color: '#667eea' }}>
              Friend Requests ({friendRequests.received.length})
            </h4>
            {friendRequests.received.map((request) => (
              <div key={request.request_id} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.75rem',
                marginBottom: '0.5rem',
                background: 'white',
                borderRadius: '6px',
                border: '1px solid #ddd'
              }}>
                <div>
                  <div style={{ fontWeight: '600' }}>{request.sender_name}</div>
                  <div style={{ fontSize: '0.85rem', color: '#666' }}>{request.sender_email}</div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => handleAcceptRequest(request.request_id)}
                    className="update-btn"
                    style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleDeclineRequest(request.request_id)}
                    className="cancel-btn"
                    style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {/* Send Friend Request */}
        {!showAddFriend ? (
          <button
            onClick={() => setShowAddFriend(true)}
            className="update-btn"
            style={{ marginBottom: '1rem' }}
          >
            + Send Friend Request
          </button>
        ) : (
          <form onSubmit={handleSendFriendRequest} className="profile-form" style={{ marginBottom: '1rem' }}>
            <div className="form-group">
              <label>Friend's Email</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="email"
                  value={friendEmail}
                  onChange={(e) => setFriendEmail(e.target.value)}
                  placeholder="friend@example.com"
                  required
                  style={{ flex: 1 }}
                />
                <button type="submit" className="update-btn">Send</button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddFriend(false);
                    setFriendEmail('');
                  }}
                  className="cancel-btn"
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        )}
        
        {/* Sent Requests */}
        {friendRequests.sent.length > 0 && (
          <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(200, 200, 200, 0.1)', borderRadius: '8px' }}>
            <h4 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '0.95rem' }}>
              Pending Requests Sent ({friendRequests.sent.length})
            </h4>
            {friendRequests.sent.map((request) => (
              <div key={request.request_id} style={{
                padding: '0.5rem',
                marginBottom: '0.25rem',
                fontSize: '0.9rem',
                color: '#666',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontWeight: '500' }}>{request.receiver_name || `User ${request.receiver_id}`}</div>
                  {request.receiver_email && (
                    <div style={{ fontSize: '0.85rem', color: '#888' }}>{request.receiver_email}</div>
                  )}
                </div>
                <span style={{ fontSize: '0.85rem', color: '#999', fontStyle: 'italic' }}>Pending...</span>
              </div>
            ))}
          </div>
        )}
        
        {/* Friends List */}
        <h4 style={{ marginTop: '1rem', marginBottom: '0.75rem' }}>My Friends</h4>
        {friends.length === 0 ? (
          <p style={{ color: '#999', fontStyle: 'italic' }}>No friends yet. Send friend requests to get trust bonuses!</p>
        ) : (
          <div className="friends-list">
            {friends.map((friend) => (
              <div key={friend.user_id} className="friend-item" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.75rem',
                marginBottom: '0.5rem',
                background: 'rgba(255, 255, 255, 0.8)',
                borderRadius: '8px',
                border: '1px solid #ddd'
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <div style={{ fontWeight: '600' }}>{friend.name}</div>
                    <div style={{ 
                      fontSize: '0.75rem', 
                      color: friendOnlineStatus[friend.user_id] ? '#28a745' : '#999',
                      fontWeight: '500'
                    }}>
                      {friendOnlineStatus[friend.user_id] ? '🟢 Online' : '⚫ Offline'}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem' }}>
                    {friend.email}
                  </div>
                  {(friend.university || friend.location) && (
                    <div style={{ fontSize: '0.85rem', color: '#888' }}>
                      {friend.university && <span>🎓 {friend.university}</span>}
                      {friend.university && friend.location && <span> • </span>}
                      {friend.location && <span>📍 {friend.location}</span>}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button
                    onClick={() => handleInviteFriend(friend.user_id, friend.name)}
                    className="update-btn"
                    style={{ 
                      padding: '0.5rem 1rem', 
                      fontSize: '0.9rem',
                      opacity: friendOnlineStatus[friend.user_id] ? 1 : 0.5,
                      cursor: friendOnlineStatus[friend.user_id] ? 'pointer' : 'not-allowed'
                    }}
                    disabled={!friendOnlineStatus[friend.user_id]}
                    title={friendOnlineStatus[friend.user_id] ? 'Invite to session' : 'Friend is not online'}
                  >
                    {friendOnlineStatus[friend.user_id] ? '📨 Invite' : 'Not Online'}
                  </button>
                  <button
                    onClick={() => handleRemoveFriend(friend.user_id)}
                    className="cancel-btn"
                    style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Account Statistics */}
      {profile.stats && (
        <div className="profile-section">
          <h3>Account Statistics</h3>
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-label">Total Sessions</div>
              <div className="stat-value">{profile.stats.total_sessions}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Total Study Time</div>
              <div className="stat-value">{profile.stats.total_study_time_formatted}</div>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Section */}
      <div className="profile-section">
        <h3>Change Password</h3>
        {!showPasswordForm ? (
          <button
            onClick={() => setShowPasswordForm(true)}
            className="change-password-btn"
          >
            Change Password
          </button>
        ) : (
          <form onSubmit={handleChangePassword} className="profile-form">
            <div className="form-group">
              <label>Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            
            <div className="form-group">
              <label>New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            
            <div className="form-group">
              <label>Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            
            <div className="form-actions">
              <button type="submit" className="update-btn">Change Password</button>
              <button
                type="button"
                onClick={() => {
                  setShowPasswordForm(false);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
                className="cancel-btn"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default Profile;

