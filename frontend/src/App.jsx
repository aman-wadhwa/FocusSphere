import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import './index.css';
import PomodoroTimer from './PomodoroTimer';
import StudyStats from './StudyStats';
import Profile from './Profile';

// Your LOCAL backend URL
// const API_URL = "http://127.0.0.1:5000";
const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:5000";

// --- API Client (no change) ---
const apiClient = axios.create({ baseURL: API_URL });
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// --- Socket Connection (global ref) ---
// We use a ref so the socket isn't recreated on every render
// Configure socket with better error handling and reconnection
const socket = io(API_URL, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
  timeout: 20000,
  forceNew: false
});

// Add connection error logging
socket.on('connect_error', (error) => {
  console.error('❌ Socket connection error:', error);
  console.error('   API_URL:', API_URL);
  console.error('   Error message:', error.message);
});

socket.on('connect', () => {
  console.log('✅ Socket connected successfully');
  console.log('   Socket ID:', socket.id);
  console.log('   API_URL:', API_URL);
});

socket.on('disconnect', (reason) => {
  console.warn('⚠ Socket disconnected:', reason);
});

socket.on('error', (error) => {
  console.error('❌ Socket error:', error);
});

function App() {
  // Form states
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  // App states
  const [message, setMessage] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  // Dashboard states
  const [studyGoal, setStudyGoal] = useState('');
  const [matchResults, setMatchResults] = useState(null);
  
  // Preference states
  const [preferredSessionLength, setPreferredSessionLength] = useState('medium');
  const [studyStyle, setStudyStyle] = useState('flexible');
  const [timezone, setTimezone] = useState('');
  const [similarityThreshold, setSimilarityThreshold] = useState(0.3);
  
  // Socket registration state
  const [isSocketRegistered, setIsSocketRegistered] = useState(false);

  // --- NEW: Invitation State ---
  const [incomingInvite, setIncomingInvite] = useState(null); // { inviter: { user_id, name, study_goal } }
  const [outgoingInvite, setOutgoingInvite] = useState(null); // { invitee_user_id, invitee_name }
  const [inviteTimer, setInviteTimer] = useState(15); // Timer in seconds for incoming invite
  const [outgoingInviteTimer, setOutgoingInviteTimer] = useState(15); // Timer for outgoing invite
  const [sessionRoom, setSessionRoom] = useState(null);
  const [sessionId, setSessionId] = useState(null); // Track current session ID
  const [pomodoroCount, setPomodoroCount] = useState(0); // Track pomodoros in current session
  const [messages, setMessages] = useState([]); // Holds all chat messages
  const [newMessage, setNewMessage] = useState(''); // The user's current typed message
  const chatBottomRef = useRef(null); // To auto-scroll chat
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard' or 'stats'
  
  // Google Meet state
  const [googleMeetRequest, setGoogleMeetRequest] = useState(null); // { requester_id, requester_name }
  const [googleMeetAccepted, setGoogleMeetAccepted] = useState(false); // Whether current user accepted
  const [googleMeetLink, setGoogleMeetLink] = useState(null); // The generated meet link
  
  // Rating modal state
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [sessionIdForRating, setSessionIdForRating] = useState(null);
  const [roomIdForRating, setRoomIdForRating] = useState(null); // Store room_id as fallback
  const [sessionRating, setSessionRating] = useState(0);
  const [matchmakingRating, setMatchmakingRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  
  // Session partner state
  const [sessionPartner, setSessionPartner] = useState(null); // { partner, are_friends, partner_online, friend_request_status, friend_request_id }

  // Define invite handler using useCallback to ensure it persists
  const handleInviteReceived = useCallback((data) => {
    console.log('🎉 INVITE RECEIVED EVENT TRIGGERED!');
    console.log('Full data:', data);
    console.log('Inviter data:', data?.inviter);
    console.log('Current socket ID:', socket.id);
    console.log('Socket connected:', socket.connected);
    
    if (data && data.inviter) {
      console.log('✓ Valid invite data, setting incoming invite');
      setIncomingInvite(data); // Save the invite data to state
      setInviteTimer(15); // Reset timer to 15 seconds
      
      // Also show a browser notification if possible
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('New Study Invitation!', {
          body: `${data.inviter.name} wants to study with you!`,
          icon: '/vite.svg'
        });
      } else if ('Notification' in window && Notification.permission === 'default') {
        // Request permission
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            new Notification('New Study Invitation!', {
              body: `${data.inviter.name} wants to study with you!`,
              icon: '/vite.svg'
            });
          }
        });
      }
    } else {
      console.error('✗ Invalid invite data received:', data);
    }
  }, []);

  // Helper function to register socket with retry (defined early so it can be used in useEffect)
  const registerSocketWithRetry = async (maxRetries = 10, delay = 1000) => {
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('❌ No token found for socket registration');
      return false;
    }
    
    console.log(`🔄 Starting socket registration (max ${maxRetries} attempts, ${delay}ms delay)`);
    console.log(`   Socket connected: ${socket.connected}`);
    console.log(`   Socket ID: ${socket.id || 'none'}`);
    console.log(`   API_URL: ${API_URL}`);
    
    // First, ensure socket is connected
    if (!socket.connected) {
      console.log('⏳ Socket not connected, attempting to connect...');
      socket.connect();
      
      // Wait for connection with longer timeout
      const connected = await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.warn('⏱ Socket connection timeout');
          resolve(false);
        }, 5000);
        
        if (socket.connected) {
          clearTimeout(timeout);
          resolve(true);
        } else {
          socket.once('connect', () => {
            clearTimeout(timeout);
            console.log('✅ Socket connected during registration');
            resolve(true);
          });
        }
      });
      
      if (!connected) {
        console.error('❌ Failed to establish socket connection');
        return false;
      }
    }
    
    // Now try to register
    for (let i = 0; i < maxRetries; i++) {
      if (socket.connected) {
        console.log(`📤 Registering socket (attempt ${i + 1}/${maxRetries})...`);
        console.log(`   Socket ID: ${socket.id}`);
        console.log(`   Token present: ${!!token}`);
        
        // Wait for confirmation with longer timeout
        const registered = await new Promise(async (resolve) => {
          let resolved = false;
          
          const timeout = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              socket.off('registration_confirmed', handler);
              socket.off('registration_failed', failHandler);
              console.warn(`⏱ Registration timeout on attempt ${i + 1}`);
              resolve(false);
            }
          }, delay * 2); // Double the delay for registration timeout
          
          const handler = (data) => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              socket.off('registration_confirmed', handler);
              socket.off('registration_failed', failHandler);
              console.log('✅ Registration confirmed:', data);
              setIsSocketRegistered(true);
              resolve(true);
            }
          };
          
          const failHandler = (error) => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              socket.off('registration_confirmed', handler);
              socket.off('registration_failed', failHandler);
              console.error('❌ Registration failed:', error);
              resolve(false);
            }
          };
          
          socket.once('registration_confirmed', handler);
          socket.once('registration_failed', failHandler);
          
          // Emit registration with error callback
          console.log('📤 Emitting register_connection event...');
          console.log('   Token length:', token.length);
          console.log('   Token preview:', token.substring(0, 20) + '...');
          
          try {
            socket.emit('register_connection', { token: token }, (response) => {
              // Acknowledge callback (if server supports it)
              if (response) {
                console.log('📥 Registration acknowledge:', response);
              }
            });
            
            // Small delay to ensure event is sent before waiting for response
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (emitError) {
            console.error('❌ Error emitting registration:', emitError);
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              socket.off('registration_confirmed', handler);
              socket.off('registration_failed', failHandler);
              resolve(false);
            }
          }
        });
        
        if (registered) {
          console.log('✅ Socket registration successful!');
          return true;
        } else {
          console.warn(`⚠ Registration attempt ${i + 1} failed, retrying...`);
          // Wait before next attempt
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } else {
        console.warn('⚠ Socket disconnected during registration, reconnecting...');
        socket.connect();
        await new Promise(resolve => {
          socket.once('connect', () => resolve());
          setTimeout(() => resolve(), delay);
        });
      }
    }
    
    console.error('❌ Socket registration failed after all retries');
    return false;
  };

  // --- Effect for Socket Listeners ---
  useEffect(() => {
    // Check for existing token
    const token = localStorage.getItem('token');
    if (token) {
      setIsLoggedIn(true);
    }

    // Main match_confirmed handler - define it first so it can be used in other handlers
    const handleMatchConfirmed = (data) => {
      console.log('🎉 MATCH CONFIRMED EVENT RECEIVED IN MAIN HANDLER!', data);
      console.log('  - Room ID:', data.room_id);
      console.log('  - Session ID:', data.session_id);
      console.log('  - Invitee name:', data.invitee_name);
      console.log('  - Full data:', JSON.stringify(data, null, 2));
      console.log('  - Current sessionRoom state:', sessionRoom);
      
      if (!data.room_id) {
        console.error('✗ No room_id in match_confirmed data!');
        setMessage('Error: Invalid session data received');
        return;
      }
      
      // Prevent duplicate processing if we already have this session
      if (sessionRoom === data.room_id) {
        console.log('⚠ Already in this session room, ignoring duplicate match_confirmed');
        return;
      }
      
      // Save the room ID and session info
      setSessionRoom(data.room_id);
      setSessionId(data.session_id); // Save the session ID for tracking
      setPomodoroCount(0); // Reset pomodoro count
      setIncomingInvite(null); // Close the invite pop-up
      setOutgoingInvite(null); // Clear outgoing invite
      setInviteTimer(15); // Reset timers
      setOutgoingInviteTimer(15);
      setGoogleMeetRequest(null); // Clear Google Meet request
      setGoogleMeetAccepted(false);
      setGoogleMeetLink(null);
      setMatchResults(null);
      setMessages([]);

      // Join the room (backend already joined us, but this ensures frontend state is synced)
      socket.emit('join_room', { room_id: data.room_id });
      console.log('✓ Emitted join_room for:', data.room_id);
      
      // Fetch partner info - wait a bit for session to be committed to database
      // For inviter, wait longer since session is created on accept_invitation
      const isInviter = !data.invitee_name; // If no invitee_name, we're the inviter
      const delay = isInviter ? 2500 : 1500; // Inviter needs more time (2.5s), invitee needs 1.5s
      console.log(`⏳ Will fetch partner info in ${delay}ms (${isInviter ? 'inviter' : 'invitee'})`);
      setTimeout(() => {
        fetchSessionPartner(data.room_id);
      }, delay);
      
      if(data.invitee_name) {
          setMessage(`Session started with ${data.invitee_name}! Joined room: ${data.room_id}`);
      } else {
          setMessage(`Session started! Joined room: ${data.room_id}`);
      }
      
      console.log('✓ Session room state updated, UI should show session interface');
    };

    // --- Define Socket Listeners ---
    const handleConnect = async () => {
      console.log('Connected to WebSocket server');
      
      // Re-register listeners on every connect to ensure they're active
      socket.off('invite_received', handleInviteReceived);
      socket.on('invite_received', handleInviteReceived);
      console.log('✓ invite_received listener re-registered on connect');
      
      // Also re-register match_confirmed listener
      socket.off('match_confirmed', handleMatchConfirmed);
      socket.on('match_confirmed', handleMatchConfirmed);
      console.log('✓ match_confirmed listener re-registered on connect');
      
      // Re-register friend_request_received listener
      socket.off('friend_request_received');
      socket.on('friend_request_received', (data) => {
        console.log('✓ Friend request received:', data);
        setMessage(`${data.sender_name} sent you a friend request!`);
        // Refresh partner info if in a session (check both sessionRoom state and data.session_room_id)
        const roomToRefresh = sessionRoom || data.session_room_id;
        if (roomToRefresh) {
          // Refresh immediately and retry to ensure UI updates
          fetchSessionPartner(roomToRefresh);
          setTimeout(() => {
            fetchSessionPartner(roomToRefresh);
          }, 500);
          setTimeout(() => {
            fetchSessionPartner(roomToRefresh);
          }, 1500);
        }
      });
      console.log('✓ friend_request_received listener re-registered on connect');
      
      // Always register when connected if we have a token
      const currentToken = localStorage.getItem('token');
      if (currentToken) {
        console.log('Registering socket connection...');
        // Use retry function for more reliable registration
        const registered = await registerSocketWithRetry(5, 300);
        if (registered) {
          console.log('✓ Socket registered successfully on connect');
        } else {
          console.warn('⚠ Socket registration failed on connect');
        }
      }
    };

    // Register connection handler
    socket.on('connect', handleConnect);
    
    // Set up invite_received listener immediately (before connect handler)
    // This ensures it's ready as soon as socket connects
    socket.off('invite_received', handleInviteReceived);
    socket.on('invite_received', handleInviteReceived);
    console.log('✓ invite_received listener registered (initial setup)');
    console.log('  - Socket connected:', socket.connected);
    console.log('  - Socket ID:', socket.id);
    
    // Also set up test_event listener for debugging
    socket.off('test_event');
    socket.on('test_event', (data) => {
      console.log('✓ Test event received:', data);
      if (data.inviter_name) {
        console.log(`⚠ Test event from invite - inviter: ${data.inviter_name}`);
        console.log('⚠ This means the backend sent an invite - check if invite_received was also received');
      }
    });
    
    // If already connected, register immediately with retry
    if (socket.connected && token) {
      console.log('Socket already connected, registering immediately...');
      registerSocketWithRetry(5, 300).then(registered => {
        if (registered) {
          console.log('✓ Socket registered successfully (already connected)');
        }
      });
    }
    
    // Also listen for disconnect to handle reconnection
    socket.on('disconnect', () => {
      console.log('Socket disconnected');
      setIsSocketRegistered(false);
      
      // Try to set status to idle when socket disconnects (if we have a token)
      const token = localStorage.getItem('token');
      if (token && isLoggedIn) {
        // Use fetch to set status to idle
        fetch(`${API_URL}/api/users/me/status`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ status: 'idle' })
        }).catch(err => console.error('Error setting status on disconnect:', err));
      }
    });
    
    // Re-register on reconnect
    socket.on('reconnect', async () => {
      console.log('Socket reconnected - re-registering listeners and connection');
      const currentToken = localStorage.getItem('token');
      if (currentToken) {
        const registered = await registerSocketWithRetry(5, 300);
        if (registered) {
          console.log('✓ Socket re-registered successfully after reconnect');
        }
      }
      // Re-register listeners in case they were lost (remove old first)
      socket.off('invite_received', handleInviteReceived);
      socket.on('invite_received', handleInviteReceived);
      console.log('✓ Re-registered invite_received listener after reconnect');
      
      socket.off('match_confirmed', handleMatchConfirmed);
      socket.on('match_confirmed', handleMatchConfirmed);
      console.log('✓ Re-registered match_confirmed listener after reconnect');
      console.log('New socket ID:', socket.id);
    });

    socket.on('registration_confirmed', (data) => {
      console.log('✅ Socket registration confirmed:', data);
      console.log('   User ID:', data.user_id);
      console.log('   Socket ID:', data.socket_id);
      console.log('   Status:', data.status);
      setIsSocketRegistered(true);
      
      // Ensure listeners are active after registration
      socket.off('invite_received', handleInviteReceived);
      socket.on('invite_received', handleInviteReceived);
      console.log('✓ invite_received listener re-registered after registration confirmation');
      
      socket.off('match_confirmed', handleMatchConfirmed);
      socket.on('match_confirmed', handleMatchConfirmed);
      console.log('✓ match_confirmed listener re-registered after registration confirmation');
      
      // Re-register friend_request_received listener
      socket.off('friend_request_received');
      socket.on('friend_request_received', (data) => {
        console.log('✓ Friend request received:', data);
        setMessage(`${data.sender_name} sent you a friend request!`);
        // Refresh partner info if in a session (check both sessionRoom state and data.session_room_id)
        const roomToRefresh = sessionRoom || data.session_room_id;
        if (roomToRefresh) {
          // Refresh immediately and retry to ensure UI updates
          fetchSessionPartner(roomToRefresh);
          setTimeout(() => {
            fetchSessionPartner(roomToRefresh);
          }, 500);
          setTimeout(() => {
            fetchSessionPartner(roomToRefresh);
          }, 1500);
        }
      });
      console.log('✓ friend_request_received listener re-registered after registration confirmation');
    });
    
    socket.on('registration_failed', (data) => {
      console.error('❌ Socket registration failed:', data);
      console.error('   Error:', data.error || data);
      console.error('   Socket ID:', socket.id);
      console.error('   Socket connected:', socket.connected);
      setIsSocketRegistered(false);
    });
    
    // Set up invite_received listener - use persistent handler
    // Remove any existing listener first to avoid duplicates
    socket.off('invite_received', handleInviteReceived);
    socket.on('invite_received', handleInviteReceived);
    
    // Also verify listener is set up
    console.log('✓ invite_received listener registered (in useEffect)');
    console.log('Socket connected:', socket.connected);
    console.log('Socket ID:', socket.id);
    
    // Set up a periodic check to ensure listeners are still active
    const listenerCheckInterval = setInterval(() => {
      if (socket.connected) {
        // Re-register all listeners periodically to ensure they stay active
        socket.off('invite_received', handleInviteReceived);
        socket.on('invite_received', handleInviteReceived);
        
        socket.off('match_confirmed', handleMatchConfirmed);
        socket.on('match_confirmed', handleMatchConfirmed);
        
        // Re-register friend_request_received listener
        socket.off('friend_request_received');
        socket.on('friend_request_received', (data) => {
          console.log('✓ Friend request received (periodic check):', data);
          setMessage(`${data.sender_name} sent you a friend request!`);
          // Refresh partner info if in a session (check both sessionRoom state and data.session_room_id)
          const roomToRefresh = sessionRoom || data.session_room_id;
          if (roomToRefresh) {
            // Refresh immediately and retry to ensure UI updates
            fetchSessionPartner(roomToRefresh);
            setTimeout(() => {
              fetchSessionPartner(roomToRefresh);
            }, 500);
            setTimeout(() => {
              fetchSessionPartner(roomToRefresh);
            }, 1500);
          }
        });
      }
    }, 10000); // Re-register every 10 seconds to ensure they stay active
    
    socket.on('error', (data) => {
      console.error('Socket error:', data);
      setMessage(`Error: ${data.message || 'An error occurred'}`);
    });

    // Listen for friend request accepted
    socket.on('friend_request_accepted', (data) => {
      console.log('✓ Friend request accepted:', data);
      setMessage(`You are now friends with ${data.friend_name}!`);
      // Refresh partner info if in a session (check both sessionRoom state and data.session_room_id)
      const roomToRefresh = sessionRoom || data.session_room_id;
      if (roomToRefresh) {
        // Refresh immediately and retry to ensure UI updates
        fetchSessionPartner(roomToRefresh);
        setTimeout(() => {
          fetchSessionPartner(roomToRefresh);
        }, 500);
        setTimeout(() => {
          fetchSessionPartner(roomToRefresh);
        }, 1500);
      }
    });

    // Listen for friend request received (when someone sends you a request)
    const handleFriendRequestReceived = (data) => {
      console.log('✓ Friend request received (main handler):', data);
      setMessage(`${data.sender_name} sent you a friend request!`);
      // Refresh partner info if in a session (check both sessionRoom state and data.session_room_id)
      const roomToRefresh = sessionRoom || data.session_room_id;
      if (roomToRefresh) {
        console.log(`🔄 Refreshing partner info for room: ${roomToRefresh}`);
        // Refresh immediately and retry to ensure UI updates
        fetchSessionPartner(roomToRefresh);
        setTimeout(() => {
          fetchSessionPartner(roomToRefresh);
        }, 500);
        setTimeout(() => {
          fetchSessionPartner(roomToRefresh);
        }, 1500);
      } else {
        console.log('⚠ No session room found to refresh partner info');
      }
    };
    
    socket.on('friend_request_received', handleFriendRequestReceived);
    console.log('✓ friend_request_received listener registered in main useEffect');
    

    // Listen for invite declined notification (for inviter)
    socket.on('invite_declined', (data) => {
      console.log('❌ Invite declined notification received:', data);
      setOutgoingInvite(null); // Clear outgoing invite
      setOutgoingInviteTimer(15); // Reset timer
      setMessage('Your invitation was declined. You can send another invite now.');
    });

    // Listen for Google Meet requests (only received by non-requester)
    socket.on('google_meet_requested', (data) => {
      console.log('📹 Google Meet requested:', data);
      // Only show request if we're not the requester
      // The backend only sends this to other users, so we can safely show it
      setGoogleMeetRequest(data);
      setGoogleMeetAccepted(false);
      setGoogleMeetLink(null);
    });

    // Listen for Google Meet acceptance
    socket.on('google_meet_accepted', (data) => {
      console.log('✓ Google Meet accepted:', data);
      if (data.all_accepted) {
        // Both users accepted - show button to go to Google Meet
        setGoogleMeetLink('ready'); // Use 'ready' as a flag instead of actual link
        setGoogleMeetRequest(null); // Clear request state
        setGoogleMeetAccepted(false);
      } else if (data.accepted_by_me) {
        setGoogleMeetAccepted(true);
      }
    });

    socket.on('receive_message', (messageData) => {
        console.log('📨 Message received:', messageData);
        console.log('  - Current messages count:', messages.length);
        
        // Add message to state, avoiding duplicates
        setMessages((prevMessages) => {
          // Check if message already exists (by id)
          const exists = prevMessages.some(msg => msg.id === messageData.id);
          if (exists) {
            console.log('⚠ Duplicate message ignored:', messageData.id);
            return prevMessages;
          }
          console.log('✓ Adding message to state. New count:', prevMessages.length + 1);
          return [...prevMessages, messageData];
        });
    });
    
    // Test event listener for debugging
    socket.on('test_event', (data) => {
      console.log('✓ Test event received:', data);
      if (data.inviter_name) {
        console.log(`⚠ Test event from invite - inviter: ${data.inviter_name}`);
        console.log('⚠ If you see this but not the invite, there may be a listener issue');
        // If test event is received, it means the backend sent an invite
        // Check if we received the invite_received event - if not, there's a listener issue
        console.log('⚠ Test event indicates invite was sent - checking if invite_received was missed...');
        console.log('⚠ Current socket state:', {
          connected: socket.connected,
          id: socket.id,
          hasInviteListener: socket.hasListeners ? socket.hasListeners('invite_received') : 'unknown'
        });
      }
    });
    
    // Debug: Log socket connection info
    console.log('Socket connection state:', {
      connected: socket.connected,
      id: socket.id,
      transport: socket.io?.engine?.transport?.name
    });

    // Clean up listeners on component unmount
    return () => {
      if (listenerCheckInterval) {
        clearInterval(listenerCheckInterval);
      }
      socket.off('connect', handleConnect);
      socket.off('reconnect');
      socket.off('invite_received', handleInviteReceived);
      socket.off('match_confirmed', handleMatchConfirmed);
      socket.off('invite_declined');
      socket.off('receive_message');
      socket.off('test_event');
      socket.off('disconnect');
      socket.off('registration_confirmed');
      socket.off('registration_failed');
      socket.off('error');
      socket.off('friend_request_received');
    };
  }, []); // Empty dependency array means this runs once on mount

  // Cleanup: End session when component unmounts or session ends
  useEffect(() => {
    return () => {
      // End session on unmount if still active
      if (sessionId) {
        endCurrentSession().catch(console.error);
      }
    };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Timer for incoming invite
  useEffect(() => {
    if (!incomingInvite) {
      setInviteTimer(15);
      return;
    }

    if (inviteTimer <= 0) {
      console.log('⏱ Incoming invite timer expired');
      setIncomingInvite(null);
      setInviteTimer(15);
      return;
    }

    const timer = setTimeout(() => {
      setInviteTimer(prev => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [incomingInvite, inviteTimer]);

  // Timer for outgoing invite
  useEffect(() => {
    if (!outgoingInvite) {
      setOutgoingInviteTimer(15);
      return;
    }

    if (outgoingInviteTimer <= 0) {
      console.log('⏱ Outgoing invite timer expired');
      setOutgoingInvite(null);
      setOutgoingInviteTimer(15);
      setMessage('Invitation expired. You can send another invite now.');
      return;
    }

    const timer = setTimeout(() => {
      setOutgoingInviteTimer(prev => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [outgoingInvite, outgoingInviteTimer]);

  // Handle page close/unload - set status to idle
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      const token = localStorage.getItem('token');
      if (!token) return;
      
      // Set status to idle when page is closing
      // Use fetch with keepalive (fire-and-forget, don't await)
      fetch(`${API_URL}/api/users/me/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'idle' }),
        keepalive: true // Ensures request completes even if page closes
      }).catch(() => {}); // Ignore errors, page is closing
      
      // End current session if active
      if (sessionId) {
        fetch(`${API_URL}/api/sessions/end`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            session_id: sessionId,
            pomodoro_count: pomodoroCount
          }),
          keepalive: true
        }).catch(() => {}); // Ignore errors, page is closing
      }
      
      // Also disconnect socket
      if (socket.connected) {
        socket.disconnect();
      }
    };

    // Also handle pagehide (more reliable than beforeunload in some browsers)
    const handlePageHide = (e) => {
      handleBeforeUnload(e);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [sessionId, pomodoroCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // -- NEW: Auto-scroll chat to bottom --
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- Auth Handlers ---
  const handleRegister = async (e) => {
    e.preventDefault();
    setMessage('Registering...');
    try {
      const response = await apiClient.post('/api/auth/register', { name: regName, email: regEmail, password: regPassword });
      setMessage(`Success! User ${response.data.user.name} registered. Please log in.`);
      setRegName(''); setRegEmail(''); setRegPassword('');
    } catch (error) {
      setMessage(`Error: ${error.response?.data?.error || 'Could not register'}`);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setMessage('Logging in...');
    try {
      const response = await apiClient.post('/api/auth/login', { email: loginEmail, password: loginPassword });
      const { token } = response.data;
      
      localStorage.setItem('token', token);
      setIsLoggedIn(true);
      setMessage('Login successful!');
      
      // --- Register socket connection on login with retry ---
      const registerSocketAfterLogin = async () => {
        // Use the retry function to ensure registration succeeds
        const registered = await registerSocketWithRetry(10, 300);
        if (registered) {
          console.log('✓ Socket registered successfully after login');
          setIsSocketRegistered(true);
        } else {
          console.warn('⚠ Socket registration failed after login, but continuing...');
          // Still set to true to allow user to proceed, but show warning
          setIsSocketRegistered(false);
        }
      };
      
      // Ensure socket is connected first
      if (socket.connected) {
        await registerSocketAfterLogin();
      } else {
        // Wait for connection, then register
        socket.once('connect', async () => {
          console.log('Socket connected after login, registering...');
          await registerSocketAfterLogin();
        });
        // Also try to connect if not already
        if (!socket.connected) {
          socket.connect();
        }
      }
      
      setLoginEmail(''); setLoginPassword('');
    } catch (error) {
      setMessage(`Error: ${error.response?.data?.error || 'Invalid credentials'}`);
    }
  };

  // --- Session Management ---
  const endCurrentSession = async () => {
    if (sessionId) {
      try {
        await apiClient.post('/api/sessions/end', {
          session_id: sessionId,
          pomodoro_count: pomodoroCount
        });
        console.log('Session ended successfully');
      } catch (error) {
        console.error('Error ending session:', error);
      }
    }
  };

  const fetchSessionPartner = async (roomId, retries = 8) => {
    if (!roomId) {
      console.warn('fetchSessionPartner called without roomId');
      return;
    }
    
    console.log(`🔍 Fetching partner info for room: ${roomId} (${retries} retries)`);
    
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          console.error('No token found');
          return;
        }
        
        const response = await axios.get(`${API_URL}/api/sessions/partner?room_id=${roomId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response.data) {
          setSessionPartner(response.data);
          console.log('✓ Partner info fetched successfully:', response.data);
          console.log('  - Are friends:', response.data.are_friends);
          console.log('  - Friend request status:', response.data.friend_request_status);
          return; // Success, exit retry loop
        }
      } catch (error) {
        console.error(`✗ Error fetching partner info (attempt ${attempt + 1}/${retries}):`, error);
        console.error('  - Status:', error.response?.status);
        console.error('  - Message:', error.response?.data?.error || error.message);
        
        // If it's a 404 and we have retries left, wait and retry
        if (error.response?.status === 404 && attempt < retries - 1) {
          const delay = (attempt + 1) * 1000; // Start with 1s, then 2s, 3s, etc.
          console.log(`⏳ Session might not be ready yet, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // For other errors or final attempt, log and show message
        if (error.response?.status !== 404 || attempt === retries - 1) {
          console.warn('⚠ Could not fetch partner info after all retries');
          if (error.response?.status !== 404) {
            setMessage('Could not load partner information. Please refresh the page.');
          }
        }
        break;
      }
    }
  };

  const handleSendFriendRequestInSession = async () => {
    if (!sessionPartner || !sessionRoom) return;
    
    // Use partner ID if available, otherwise use email
    const partnerId = sessionPartner.partner?.id;
    const partnerEmail = sessionPartner.partner?.email;
    
    if (!partnerId && !partnerEmail) {
      setMessage('Error: Partner information not available');
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      const requestData = partnerId 
        ? { user_id: partnerId }
        : { email: partnerEmail };
      
      console.log('📤 Sending friend request:', requestData);
      
      const response = await axios.post(
        `${API_URL}/api/friends/send-request`,
        requestData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data) {
        setMessage('Friend request sent!');
        // Refresh partner info immediately to show "request sent" status
        fetchSessionPartner(sessionRoom);
        // Also refresh after a short delay to ensure backend has processed
        setTimeout(() => {
          fetchSessionPartner(sessionRoom);
        }, 500);
      }
    } catch (error) {
      console.error('Error sending friend request:', error);
      console.error('Error response:', error.response?.data);
      const errorMsg = error.response?.data?.error || 'Failed to send friend request';
      setMessage(`Error: ${errorMsg}`);
    }
  };

  const handleAcceptFriendRequestInSession = async () => {
    if (!sessionPartner || !sessionPartner.friend_request_id) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/api/friends/accept-request`,
        { request_id: sessionPartner.friend_request_id },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data) {
        setMessage('Friend request accepted! You are now friends.');
        // Refresh partner info immediately and retry to show full details
        fetchSessionPartner(sessionRoom);
        setTimeout(() => {
          fetchSessionPartner(sessionRoom);
        }, 500);
        setTimeout(() => {
          fetchSessionPartner(sessionRoom);
        }, 1500);
        setTimeout(() => {
          fetchSessionPartner(sessionRoom);
        }, 1500);
      }
    } catch (error) {
      console.error('Error accepting friend request:', error);
      setMessage(error.response?.data?.error || 'Failed to accept friend request');
    }
  };

  const handleDeclineFriendRequestInSession = async () => {
    if (!sessionPartner || !sessionPartner.friend_request_id) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/api/friends/decline-request`,
        { request_id: sessionPartner.friend_request_id },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data) {
        setMessage('Friend request declined.');
        // Refresh partner info
        setTimeout(() => {
          fetchSessionPartner(sessionRoom);
        }, 500);
      }
    } catch (error) {
      console.error('Error declining friend request:', error);
      setMessage(error.response?.data?.error || 'Failed to decline friend request');
    }
  };

  const handleLeaveSession = async () => {
    // Save session ID and room ID before clearing them (needed for rating)
    const currentSessionId = sessionId;
    const currentRoomId = sessionRoom;
    
    // Emit leave_room event to notify others
    if (sessionRoom && socket.connected) {
      socket.emit('leave_room', { room_id: sessionRoom });
    }
    
    await endCurrentSession();
    
    // Clear session state
    setSessionRoom(null);
    setSessionId(null);
    setPomodoroCount(0);
    setMessages([]);
    setSessionPartner(null);
    setMessage('Left study session');
    
    // Show rating modal if we had a session
    if (currentSessionId || currentRoomId) {
      setSessionIdForRating(currentSessionId);
      setRoomIdForRating(currentRoomId);
      setSessionRating(0);
      setMatchmakingRating(0);
      setFeedbackText('');
      setShowRatingModal(true);
    }
  };
  
  const handleSubmitRating = async () => {
    if (!sessionIdForRating && !roomIdForRating) return;
    
    // At least one rating should be provided
    if (sessionRating === 0 && matchmakingRating === 0) {
      setMessage('Please provide at least one rating');
      return;
    }
    
    try {
      await apiClient.post('/api/sessions/rate', {
        session_id: sessionIdForRating || null,
        room_id: roomIdForRating || null,
        session_rating: sessionRating || null,
        matchmaking_rating: matchmakingRating || null,
        feedback_text: feedbackText || null
      });
      
      setMessage('Thank you for your feedback!');
      setShowRatingModal(false);
      setSessionIdForRating(null);
      setRoomIdForRating(null);
      setSessionRating(0);
      setMatchmakingRating(0);
      setFeedbackText('');
    } catch (error) {
      setMessage(`Error: ${error.response?.data?.error || 'Could not submit rating'}`);
    }
  };
  
  const handleSkipRating = () => {
    setShowRatingModal(false);
    setSessionIdForRating(null);
    setRoomIdForRating(null);
    setSessionRating(0);
    setMatchmakingRating(0);
    setFeedbackText('');
  };

  const handleLogout = async () => {
    try {
      // End session before logging out
      await endCurrentSession();
      
      // Set status to idle before logging out
      try {
        await apiClient.put('/api/users/me/status', { status: 'idle' });
        console.log('✓ Status set to idle on logout');
      } catch (error) {
        console.error('Error setting status to idle:', error);
      }
      
      // Disconnect socket
      if (socket.connected) {
        socket.disconnect();
      }
      
      localStorage.removeItem('token');
      setIsLoggedIn(false);
      setMessage('');
      setMatchResults(null);
      setSessionRoom(null);
      setSessionId(null);
      setPomodoroCount(0);
      setIsSocketRegistered(false);
    } catch (error) {
      console.error('Error during logout:', error);
      // Still clear local state even if API calls fail
      localStorage.removeItem('token');
      setIsLoggedIn(false);
    }
  };
  


  // --- Dashboard Handlers ---
  const handleSetStatus = async (e) => {
    e.preventDefault();
    setMessage('Setting status...');
    try {
      await apiClient.put('/api/users/me/status', { 
        status: 'searching', 
        study_goal: studyGoal,
        preferred_session_length: preferredSessionLength,
        study_style: studyStyle,
        timezone: timezone || undefined,
        minimum_similarity_threshold: similarityThreshold
      });
      
      // Ensure socket is connected first - with more robust connection handling
      if (!socket.connected) {
        setMessage('Connecting to server...');
        console.log('📡 Socket not connected, attempting to connect...');
        console.log('   API_URL:', API_URL);
        
        // Disconnect and reconnect to ensure fresh connection
        if (socket.disconnected) {
          socket.connect();
        }
        
        // Wait for connection with longer timeout
        const connected = await new Promise((resolve) => {
          if (socket.connected) {
            console.log('✅ Socket already connected');
            resolve(true);
            return;
          }
          
          const timeout = setTimeout(() => {
            console.error('⏱ Socket connection timeout after 10 seconds');
            resolve(false);
          }, 10000);
          
          const connectHandler = () => {
            clearTimeout(timeout);
            socket.off('connect', connectHandler);
            console.log('✅ Socket connected successfully');
            resolve(true);
          };
          
          socket.once('connect', connectHandler);
        });
        
        if (!connected) {
          setMessage('❌ Could not connect to server. Please check your internet connection and try again.');
          console.error('❌ Failed to establish socket connection');
          return;
        }
      }
      
      // Wait a bit for socket to stabilize
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Ensure socket is registered when setting status to searching
      setMessage('Registering connection...');
      console.log('🔍 Pre-registration check:');
      console.log('   Socket connected:', socket.connected);
      console.log('   Socket ID:', socket.id);
      console.log('   API_URL:', API_URL);
      console.log('   Is registered:', isSocketRegistered);
      console.log('   Token present:', !!localStorage.getItem('token'));
      
      // Force re-registration even if already registered (to ensure it's current)
      setIsSocketRegistered(false);
      const registered = await registerSocketWithRetry(20, 1500); // Even more retries, longer delay
      
      // Re-register invite_received listener to ensure it's active
      if (socket.connected) {
        socket.off('invite_received', handleInviteReceived);
        socket.on('invite_received', handleInviteReceived);
        console.log('✓ invite_received listener re-registered after setting status to searching');
      }
      
      if (registered) {
        setMessage('Status set to "searching" and connection registered! ✓');
        console.log('✓ Socket registration confirmed');
        
        // Verify connection status with backend
        try {
          const statusResponse = await apiClient.get('/api/users/me/connection-status');
          if (statusResponse.data.is_online && statusResponse.data.socket_valid) {
            console.log('✓ Connection status verified:', statusResponse.data);
          } else {
            console.warn('⚠ Connection status check failed:', statusResponse.data);
            setMessage('⚠ Status set to "searching", but connection may not be fully active. Please refresh the page if invites don\'t work.');
          }
        } catch (statusError) {
          console.warn('⚠ Could not verify connection status:', statusError);
        }
      } else {
        setMessage('⚠ Status set to "searching", but connection registration failed. Please refresh the page and try again.');
        console.warn('⚠ Socket registration failed');
        
        // Check connection status to provide more info
        try {
          const statusResponse = await apiClient.get('/api/users/me/connection-status');
          console.log('Connection status:', statusResponse.data);
          if (!statusResponse.data.is_online) {
            setMessage('❌ Connection not registered. Please refresh the page to reconnect.');
          }
        } catch (statusError) {
          console.error('Could not check connection status:', statusError);
        }
      }
    } catch (error) {
      setMessage(`Error: ${error.response?.data?.error || 'Could not set status'}`);
    }
  };

  const handleFindMatch = async () => {
    setMessage('Finding matches...');
    setMatchResults(null);
    
    // Ensure socket is connected first
    if (!socket.connected) {
      setMessage('Connecting to server...');
      socket.connect();
      // Wait for connection with timeout
      await new Promise(resolve => {
        if (socket.connected) {
          resolve();
        } else {
          socket.once('connect', () => resolve());
          setTimeout(() => resolve(), 3000);
        }
      });
    }
    
    // Ensure socket is registered - try multiple times with increasing delays
    if (!isSocketRegistered && socket.connected) {
      console.log('Registering socket before finding matches...');
      setMessage('Registering connection...');
      
      // Try registration with more retries and longer delays
      const registered = await registerSocketWithRetry(10, 500);
      if (!registered) {
        // Even if registration seems to fail, try the API call anyway
        // The backend will check and may find the user via room membership
        console.warn('⚠ Socket registration may have failed, but trying API call anyway...');
        setMessage('Connection may still be registering. Attempting to find matches...');
        // Wait a bit more for registration to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        console.log('✓ Socket registered successfully');
      }
    }
    
    // Try the API call with retry logic
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) {
          setMessage(`Finding matches... (attempt ${attempt + 1}/3)`);
          // Wait a bit before retry
          await new Promise(resolve => setTimeout(resolve, 1000));
          // Try to register again before retry
          if (socket.connected) {
            await registerSocketWithRetry(3, 300);
          }
        }
        
        const response = await apiClient.post('/api/match/find');
        setMatchResults(response.data);
        setMessage('Matches found!');
        return; // Success, exit
      } catch (error) {
        lastError = error;
        const errorMsg = error.response?.data?.error || error.response?.data?.message || 'Could not find matches';
        const hint = error.response?.data?.hint;
        
        // If it's a connection error and we have retries left, continue
        if ((errorMsg.includes('connected') || errorMsg.includes('connection')) && attempt < 2) {
          console.log(`⚠ Connection error on attempt ${attempt + 1}, retrying...`);
          continue;
        }
        
        // Otherwise, show error
        if (hint) {
          setMessage(`Error: ${errorMsg}\n\n💡 ${hint}`);
        } else {
          setMessage(`Error: ${errorMsg}`);
        }
        console.error('Find match error:', error.response?.data);
        return; // Exit on non-retryable error
      }
    }
    
    // If we get here, all retries failed
    if (lastError) {
      const errorMsg = lastError.response?.data?.error || lastError.response?.data?.message || 'Could not find matches';
      const hint = lastError.response?.data?.hint;
      if (hint) {
        setMessage(`Error: ${errorMsg}\n\n💡 ${hint}`);
      } else {
        setMessage(`Error: ${errorMsg}. Please refresh the page and try again.`);
      }
    }
  };

  // --- NEW: Invitation Handlers ---
  const handleSendInvite = async (inviteeUserId, inviteeName) => {
    // Check if there's already a pending invite
    if (outgoingInvite) {
      setMessage('You already have a pending invitation. Please wait for a response.');
      return;
    }
    
    setMessage(`Sending invite to ${inviteeName || `user ${inviteeUserId}`}...`);
    
    // Ensure we're registered before sending invite
    if (!isSocketRegistered && socket.connected) {
      console.log('Re-registering before sending invite...');
      await registerSocketWithRetry(3, 200);
    }
    
    try {
      const response = await apiClient.post('/api/match/invite', {
        invitee_user_id: inviteeUserId
      });
      
      // Set outgoing invite state and start timer
      setOutgoingInvite({ invitee_user_id: inviteeUserId, invitee_name: inviteeName || `User ${inviteeUserId}` });
      setOutgoingInviteTimer(15);
      setMessage('Invitation sent! Waiting for response...');
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'Could not send invite';
      setMessage(`Error: ${errorMsg}`);
      
      // If user not online, suggest they wait a moment
      if (errorMsg.includes('not online')) {
        setTimeout(() => {
          setMessage('Tip: Make sure the other user is logged in and has set their status to "searching". Try again in a moment.');
        }, 2000);
      }
    }
  };

  const handleAcceptInvite = () => {
    if (!incomingInvite) {
      console.error('No incoming invite to accept');
      setMessage('Error: No invite to accept');
      return;
    }
    
    if (!socket.connected) {
      setMessage('Error: Not connected to server. Please refresh the page.');
      console.error('Socket not connected');
      return;
    }
    
    const inviterUserId = incomingInvite.inviter.user_id;
    console.log('🎯 ACCEPTING INVITATION');
    console.log('  - Inviter user ID:', inviterUserId);
    console.log('  - Incoming invite data:', incomingInvite);
    console.log('  - Socket ID:', socket.id);
    console.log('  - Socket connected:', socket.connected);
    
    setMessage('Accepting invitation...');
    
    // Track if we've received confirmation
    let matchConfirmedReceived = false;
    let timeoutId = null;
    let checkIntervalId = null;
    
    // Cleanup function
    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (checkIntervalId) {
        clearInterval(checkIntervalId);
        checkIntervalId = null;
      }
      socket.off('match_confirmed', matchConfirmedHandler);
      socket.off('error', errorHandler);
    };
    
    // Set up a timeout to handle cases where match_confirmed never arrives
    timeoutId = setTimeout(() => {
      if (!matchConfirmedReceived) {
        console.error('⏱ Timeout waiting for match_confirmed event after 15 seconds');
        console.error('  - Socket ID:', socket.id);
        console.error('  - Socket connected:', socket.connected);
        console.error('  - Current sessionRoom:', sessionRoom);
        setMessage('Error: No response from server. Please try again or refresh the page.');
        setIncomingInvite(null);
        cleanup();
      }
    }, 15000); // 15 second timeout
    
    // Listen for match_confirmed
    const matchConfirmedHandler = (data) => {
      if (matchConfirmedReceived) return; // Prevent duplicate handling
      matchConfirmedReceived = true;
      console.log('✓ Match confirmed received in accept handler:', data);
      cleanup();
      // The existing match_confirmed handler in useEffect will handle the rest
    };
    
    // Listen for errors
    const errorHandler = (data) => {
      console.error('✗ Error event received in accept handler:', data);
      setMessage(`Error: ${data.message || 'Failed to accept invitation'}`);
      setIncomingInvite(null);
      cleanup();
    };
    
    // Set up listeners BEFORE emitting
    socket.on('match_confirmed', matchConfirmedHandler);
    socket.on('error', errorHandler);
    
    // Also check if sessionRoom gets set (main handler might process it first)
    checkIntervalId = setInterval(() => {
      if (sessionRoom && !matchConfirmedReceived) {
        console.log('✓ Session room set, match was confirmed by main handler');
        matchConfirmedReceived = true;
        cleanup();
      }
    }, 500);
    
    // Emit 'accept_invitation' back to the server
    try {
      console.log('📤 Emitting accept_invitation event with data:', { inviter_user_id: inviterUserId });
      socket.emit('accept_invitation', {
        inviter_user_id: inviterUserId
      });
      console.log('✓ Accept invitation event emitted, waiting for match_confirmed...');
      console.log('  - Listening for match_confirmed on socket:', socket.id);
    } catch (error) {
      console.error('✗ Error emitting accept_invitation:', error);
      setMessage('Error: Failed to send acceptance. Please try again.');
      cleanup();
    }
  };

  const handleDeclineInvite = () => {
    if (!incomingInvite) return;
    
    const inviterUserId = incomingInvite.inviter.user_id;
    
    // Notify backend that invite was declined
    if (socket.connected) {
      socket.emit('decline_invitation', {
        inviter_user_id: inviterUserId
      });
      console.log('✓ Decline invitation event emitted');
    }
    
    setIncomingInvite(null); // Just close the pop-up
    setInviteTimer(15); // Reset timer
  };

  const handleRequestGoogleMeet = () => {
    if (!sessionRoom) return;
    
    console.log('📹 Requesting Google Meet for room:', sessionRoom);
    socket.emit('request_google_meet', {
      room_id: sessionRoom
    });
    setMessage('Google Meet request sent! Waiting for partner to accept...');
  };

  const handleAcceptGoogleMeet = () => {
    if (!sessionRoom || !googleMeetRequest) return;
    
    console.log('✓ Accepting Google Meet request');
    socket.emit('accept_google_meet', {
      room_id: sessionRoom
    });
    setGoogleMeetAccepted(true);
    setMessage('You accepted the Google Meet request. Waiting for other user...');
  };

  const handleDeclineGoogleMeet = () => {
    setGoogleMeetRequest(null);
    setGoogleMeetAccepted(false);
    setMessage('Google Meet request declined.');
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (newMessage.trim() === '' || !sessionRoom) {
      console.log('⚠ Cannot send message - empty or no session room');
      return;
    }
    
    const messageText = newMessage.trim();
    console.log('📤 Sending message:', messageText, 'to room:', sessionRoom);
    
    // Add message to local state immediately (optimistic update)
    // We'll get the actual message from server too, but this ensures immediate display
    const tempMessage = {
      id: `temp_${Date.now()}`,
      sender: 'You', // Will be replaced by server response
      text: messageText
    };
    setMessages((prevMessages) => [...prevMessages, tempMessage]);
    
    // Send the message to the server
    socket.emit('send_message', {
        room_id: sessionRoom,
        text: messageText
    });
    
    setNewMessage(''); // Clear the input box
  };

  // --- Render Auth Forms ---
  if (!isLoggedIn) {
    // ... (no change from before)
    return (
      <div className="container">
        <h1>FocusSphere</h1>
        <div className="form-container">
          <form onSubmit={handleRegister}>
            <h2>Register</h2>
            <input type="text" placeholder="Name" value={regName} onChange={(e) => setRegName(e.target.value)} required />
            <input type="email" placeholder="Email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} required />
            <input type="password" placeholder="Password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} required />
            <button type="submit">Register</button>
          </form>
          <form onSubmit={handleLogin}>
            <h2>Login</h2>
            <input type="email" placeholder="Email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required />
            <input type="password" placeholder="Password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required />
            <button type="submit">Login</button>
          </form>
        </div>
        {message && <p className="message">{message}</p>}
      </div>
    );
  }

  // --- Render Main Dashboard (Logged In) ---
  return (
    <div className="container dashboard">
      <div className="nav-header">
        <div className="nav-buttons">
          <button 
            onClick={() => setCurrentView('dashboard')} 
            className={currentView === 'dashboard' ? 'nav-btn active' : 'nav-btn'}
          >
            Dashboard
          </button>
          <button 
            onClick={() => setCurrentView('stats')} 
            className={currentView === 'stats' ? 'nav-btn active' : 'nav-btn'}
          >
            Statistics
          </button>
          <button 
            onClick={() => setCurrentView('profile')} 
            className={currentView === 'profile' ? 'nav-btn active' : 'nav-btn'}
          >
            Profile
          </button>
        </div>
        <button onClick={handleLogout} className="logout-btn">Logout</button>
      </div>
      <h1>FocusSphere Dashboard</h1>
      
      {/* Socket Connection Status Indicator */}
      {isLoggedIn && (
        <div style={{ 
          padding: '0.75rem', 
          marginBottom: '1rem', 
          borderRadius: '4px',
          backgroundColor: isSocketRegistered && socket.connected ? '#d4edda' : '#fff3cd',
          border: `1px solid ${isSocketRegistered && socket.connected ? '#28a745' : '#ffc107'}`,
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ 
              width: '10px', 
              height: '10px', 
              borderRadius: '50%', 
              backgroundColor: isSocketRegistered && socket.connected ? '#28a745' : '#ffc107'
            }}></span>
            <span>
              {socket.connected 
                ? (isSocketRegistered ? 'Connected & Registered' : 'Connected, registering...')
                : 'Disconnected'}
            </span>
            {socket.id && (
              <span style={{ fontSize: '0.8rem', color: '#666', fontFamily: 'monospace' }}>
                (ID: {socket.id.substring(0, 8)}...)
              </span>
            )}
          </div>
          {(!socket.connected || !isSocketRegistered) && (
            <button
              onClick={async () => {
                console.log('🔄 Manual reconnect requested');
                setMessage('Reconnecting...');
                setIsSocketRegistered(false);
                
                if (!socket.connected) {
                  console.log('📡 Connecting socket...');
                  socket.connect();
                  await new Promise(resolve => {
                    if (socket.connected) {
                      resolve();
                    } else {
                      socket.once('connect', resolve);
                      setTimeout(() => resolve(), 5000);
                    }
                  });
                }
                
                if (socket.connected) {
                  console.log('📤 Registering socket...');
                  const registered = await registerSocketWithRetry(15, 1000);
                  if (registered) {
                    setMessage('✅ Reconnected and registered successfully!');
                    console.log('✅ Manual reconnect successful');
                  } else {
                    setMessage('❌ Reconnection failed. Please refresh the page.');
                    console.error('❌ Manual reconnect failed');
                  }
                } else {
                  setMessage('❌ Could not connect to server. Please check your internet connection.');
                }
              }}
              style={{
                padding: '0.25rem 0.75rem',
                fontSize: '0.85rem',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Reconnect
            </button>
          )}
        </div>
      )}

      {/* Show Statistics View */}
      {currentView === 'stats' && (
        <StudyStats />
      )}

      {/* Show Profile View */}
      {currentView === 'profile' && (
        <Profile />
      )}

      {/* Show Dashboard View */}
      {currentView === 'dashboard' && (
        <>

      {/* --- NEW: Show Session Room --- */}
      {sessionRoom && (
        <div className="session-room">
          <h2>Session Active!</h2>
          <p>You are in room: <strong>{sessionRoom}</strong></p>
        </div>
      )}

      {/* --- NEW: Incoming Invite Pop-up --- */}
      {incomingInvite && (
        <div className="invite-popup">
          <h3>Incoming Invite!</h3>
          <p><strong>{incomingInvite.inviter.name}</strong> wants to study!</p>
          <p>Goal: "{incomingInvite.inviter.study_goal}"</p>
          <div style={{ 
            textAlign: 'center', 
            margin: '1rem 0', 
            fontSize: '1.2rem', 
            fontWeight: 'bold',
            color: inviteTimer <= 5 ? '#fa709a' : '#667eea'
          }}>
            {inviteTimer}s remaining
          </div>
          <div className="invite-actions">
            <button onClick={handleAcceptInvite} className="find-match-btn">Accept</button>
            <button onClick={handleDeclineInvite} className="logout-btn">Decline</button>
          </div>
        </div>
      )}

      {/* --- Outgoing Invite Status --- */}
      {outgoingInvite && (
        <div className="invite-popup" style={{ top: incomingInvite ? '10rem' : '2rem' }}>
          <h3>Invitation Sent!</h3>
          <p>Waiting for <strong>{outgoingInvite.invitee_name}</strong> to respond...</p>
          <div style={{ 
            textAlign: 'center', 
            margin: '1rem 0', 
            fontSize: '1.2rem', 
            fontWeight: 'bold',
            color: outgoingInviteTimer <= 5 ? '#fa709a' : '#667eea'
          }}>
            {outgoingInviteTimer}s remaining
          </div>
          <p style={{ fontSize: '0.9rem', color: '#666', fontStyle: 'italic' }}>
            You cannot send another invite until this one is responded to or expires.
          </p>
        </div>
      )}
      
      {/* --- NEW: SESSION ROOM / CHAT INTERFACE --- */}
      {sessionRoom ? (
        <div className="session-room-container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2>Study Session: {sessionRoom}</h2>
            <button onClick={handleLeaveSession} className="logout-btn">Leave Session</button>
          </div>
          
          {/* Partner Info / Friend Request Section */}
          {sessionPartner ? (
            <div style={{
              marginBottom: '1.5rem',
              padding: '1rem',
              background: 'rgba(255, 255, 255, 0.8)',
              backdropFilter: 'blur(10px)',
              borderRadius: 'var(--radius-lg)',
              border: '2px solid var(--border-color)'
            }}>
              {sessionPartner.are_friends ? (
                <div>
                  <h3 style={{ marginTop: 0, marginBottom: '0.75rem', color: '#667eea' }}>
                    👥 Study Partner
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ fontWeight: '600', fontSize: '1.1rem' }}>{sessionPartner.partner.name}</div>
                    {sessionPartner.partner.email && (
                      <div style={{ fontSize: '0.9rem', color: '#666' }}>📧 {sessionPartner.partner.email}</div>
                    )}
                    {sessionPartner.partner.university && (
                      <div style={{ fontSize: '0.9rem', color: '#666' }}>🎓 {sessionPartner.partner.university}</div>
                    )}
                    {sessionPartner.partner.location && (
                      <div style={{ fontSize: '0.9rem', color: '#666' }}>📍 {sessionPartner.partner.location}</div>
                    )}
                    <div style={{ fontSize: '0.85rem', color: sessionPartner.partner_online ? '#28a745' : '#999', marginTop: '0.25rem' }}>
                      {sessionPartner.partner_online ? '🟢 Online' : '⚫ Offline'}
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <h3 style={{ marginTop: 0, marginBottom: '0.75rem', color: '#667eea' }}>
                    👥 Study Partner: {sessionPartner.partner.name}
                  </h3>
                  {sessionPartner.friend_request_status === 'sent' ? (
                    <div style={{ padding: '0.75rem', background: 'rgba(102, 126, 234, 0.1)', borderRadius: '8px', color: '#667eea' }}>
                      ✓ Friend request sent! Waiting for acceptance...
                    </div>
                  ) : sessionPartner.friend_request_status === 'received' ? (
                    <div>
                      <p style={{ marginBottom: '0.75rem', color: '#666' }}>
                        {sessionPartner.partner.name} sent you a friend request!
                      </p>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={handleAcceptFriendRequestInSession}
                          className="update-btn"
                          style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                        >
                          ✓ Accept
                        </button>
                        <button
                          onClick={handleDeclineFriendRequestInSession}
                          className="cancel-btn"
                          style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                        >
                          ✗ Decline
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p style={{ marginBottom: '0.75rem', color: '#666' }}>
                        Send a friend request to see their profile details and get trust bonuses!
                      </p>
                      <button
                        onClick={handleSendFriendRequestInSession}
                        className="update-btn"
                        style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                      >
                        + Send Friend Request
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div style={{
              marginBottom: '1.5rem',
              padding: '1rem',
              background: 'rgba(255, 255, 255, 0.8)',
              backdropFilter: 'blur(10px)',
              borderRadius: 'var(--radius-lg)',
              border: '2px solid var(--border-color)',
              textAlign: 'center'
            }}>
              <p style={{ color: '#666', marginBottom: '0.5rem' }}>Loading partner information...</p>
              <button 
                onClick={() => fetchSessionPartner(sessionRoom)}
                className="update-btn"
                style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
              >
                Retry Loading Partner Info
              </button>
            </div>
          )}
          
          <PomodoroTimer 
            socket={socket} 
            sessionRoom={sessionRoom}
            onPomodoroComplete={() => setPomodoroCount(prev => prev + 1)}
          />
          
          {/* Google Meet Section */}
          <div style={{ 
            marginBottom: '1.5rem', 
            padding: '1.5rem', 
            background: 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(10px)',
            borderRadius: 'var(--radius-lg)',
            border: '2px solid var(--border-color)'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#667eea' }}>
              📹 Video Call
            </h3>
            
            {googleMeetLink ? (
              <div style={{ textAlign: 'center' }}>
                <p style={{ marginBottom: '1rem', fontWeight: 600 }}>
                  Google Meet Ready!
                </p>
                <p style={{ marginBottom: '1rem', color: '#666' }}>
                  Both users have accepted. Click below to go to Google Meet.
                </p>
                <a 
                  href="https://meet.google.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-block',
                    padding: '1rem 2rem',
                    background: 'var(--primary-gradient)',
                    color: 'white',
                    textDecoration: 'none',
                    borderRadius: 'var(--radius-md)',
                    fontWeight: 600,
                    fontSize: '1.1rem',
                    boxShadow: 'var(--shadow-md)',
                    transition: 'var(--transition)'
                  }}
                  onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
                  onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
                >
                  Go to Google Meet
                </a>
              </div>
            ) : googleMeetRequest ? (
              <div style={{ textAlign: 'center' }}>
                <p style={{ marginBottom: '1rem' }}>
                  <strong>{googleMeetRequest.requester_name}</strong> requested a Google Meet call
                </p>
                {!googleMeetAccepted ? (
                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                    <button 
                      onClick={handleAcceptGoogleMeet} 
                      className="find-match-btn"
                    >
                      Accept
                    </button>
                    <button 
                      onClick={handleDeclineGoogleMeet} 
                      className="logout-btn"
                    >
                      Decline
                    </button>
                  </div>
                ) : (
                  <p style={{ color: '#667eea', fontWeight: 600 }}>
                    Waiting for other user to accept...
                  </p>
                )}
              </div>
            ) : (
              <button 
                onClick={handleRequestGoogleMeet}
                style={{
                  width: '100%',
                  padding: '1rem',
                  background: 'var(--primary-gradient)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '1rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-md)',
                  transition: 'var(--transition)'
                }}
                onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
                onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
              >
                Request Google Meet
              </button>
            )}
          </div>
          
          <div className="chat-box">
            {messages.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#999', padding: '2rem', fontStyle: 'italic' }}>
                No messages yet. Start the conversation!
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`chat-message ${msg.sender === 'System' ? 'system' : ''}`}>
                  <strong>{msg.sender}:</strong> {msg.text}
                </div>
              ))
            )}
            <div ref={chatBottomRef} />
          </div>
          <form onSubmit={handleSendMessage} className="chat-form">
            <input
              type="text"
              placeholder="Type a message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
            />
            <button type="submit">Send</button>
          </form>
        </div>
      ) : (
        <>
          {/* --- SET STATUS / FIND MATCH (Show only if not in a room) --- */}
          <form onSubmit={handleSetStatus} className="dashboard-form">
            <h2>Set Your Study Goal & Preferences</h2>
            <input 
              type="text" 
              placeholder="What's your study goal?" 
              value={studyGoal} 
              onChange={(e) => setStudyGoal(e.target.value)} 
              required 
            />
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Preferred Session Length
                </label>
                <select 
                  value={preferredSessionLength} 
                  onChange={(e) => setPreferredSessionLength(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', border: '1px solid #ddd', borderRadius: '4px' }}
                >
                  <option value="short">Short (30-60 min)</option>
                  <option value="medium">Medium (1-2 hours)</option>
                  <option value="long">Long (2+ hours)</option>
                </select>
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Study Style
                </label>
                <select 
                  value={studyStyle} 
                  onChange={(e) => setStudyStyle(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', border: '1px solid #ddd', borderRadius: '4px' }}
                >
                  <option value="focused">Focused (Quiet, Independent)</option>
                  <option value="collaborative">Collaborative (Discussion, Group Work)</option>
                  <option value="flexible">Flexible (Adaptable)</option>
                </select>
              </div>
            </div>
            
            <div style={{ marginTop: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Timezone (Optional)
              </label>
              <input 
                type="text" 
                placeholder="e.g., UTC-5, EST, PST" 
                value={timezone} 
                onChange={(e) => setTimezone(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>
            
            <div style={{ marginTop: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Minimum Similarity Threshold: {similarityThreshold.toFixed(2)}
              </label>
              <input 
                type="range" 
                min="0.1" 
                max="0.9" 
                step="0.05" 
                value={similarityThreshold} 
                onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#666', marginTop: '0.25rem' }}>
                <span>More Flexible (0.1)</span>
                <span>More Strict (0.9)</span>
              </div>
            </div>
            
            <button type="submit" style={{ marginTop: '1rem' }}>Set Status to "Searching"</button>
          </form>
          
          <div className="dashboard-form">
            <button onClick={handleFindMatch} className="find-match-btn">Find a Match!</button>
          </div>
          
          {message && <p className="message">{message}</p>}

          {/* --- MATCH RESULTS --- */}
          {matchResults && (
            <div className="results-container">
              <h2>Match Results</h2>
              {Array.isArray(matchResults) ? (
                matchResults.map((match) => {
                  // Check if justification mentions trust bonus
                  const hasTrustBonus = match.justification && (
                    match.justification.includes('Trust bonus') || 
                    match.justification.includes('Same university') ||
                    match.justification.includes('Same location') ||
                    match.justification.includes('mutual friend')
                  );
                  
                  return (
                    <div key={match.user_id} className="match-card">
                      <h3>{match.name}</h3>
                      <p><strong>Score: {match.compatibility_score}</strong></p>
                      {hasTrustBonus && (
                        <div style={{
                          padding: '0.5rem',
                          marginBottom: '0.5rem',
                          background: 'rgba(102, 126, 234, 0.1)',
                          borderRadius: '6px',
                          border: '1px solid #667eea',
                          fontSize: '0.9rem',
                          color: '#667eea',
                          fontWeight: '500'
                        }}>
                          ⭐ Trust Bonus Applied
                        </div>
                      )}
                      <p>{match.justification}</p>
                      <button 
                        onClick={() => handleSendInvite(match.user_id, match.name)} 
                        className="invite-btn"
                        disabled={outgoingInvite !== null}
                      >
                        Invite to Study
                      </button>
                    </div>
                  );
                })
              ) : (
                <p>No matches found or invalid response.</p>
              )}
            </div>
          )}
        </>
      )}
        </>
      )}
      
      {/* --- Rating Modal --- (Moved to end to ensure it's always on top) */}
      {showRatingModal && (
        <>
          {/* Backdrop */}
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onClick={handleSkipRating}
          />
          {/* Modal */}
          <div className="invite-popup" style={{ 
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 10000,
            maxWidth: '500px',
            width: '90%',
            maxHeight: '90vh',
            overflowY: 'auto',
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '12px',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)'
          }}>
          <h3 style={{ marginTop: 0 }}>Rate Your Session</h3>
          <p style={{ marginBottom: '1.5rem', color: '#666' }}>
            Help us improve! Please rate your session and matchmaking experience.
          </p>
          
          {/* Session Rating */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              How was your study session? (1-5)
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  key={rating}
                  onClick={() => setSessionRating(rating)}
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    border: '2px solid',
                    borderColor: sessionRating === rating ? '#667eea' : '#ddd',
                    backgroundColor: sessionRating === rating ? '#667eea' : 'white',
                    color: sessionRating === rating ? 'white' : '#333',
                    fontSize: '1.2rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {rating}
                </button>
              ))}
            </div>
          </div>
          
          {/* Matchmaking Rating */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              How well did the matchmaking algorithm work? (1-5)
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  key={rating}
                  onClick={() => setMatchmakingRating(rating)}
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    border: '2px solid',
                    borderColor: matchmakingRating === rating ? '#667eea' : '#ddd',
                    backgroundColor: matchmakingRating === rating ? '#667eea' : 'white',
                    color: matchmakingRating === rating ? 'white' : '#333',
                    fontSize: '1.2rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {rating}
                </button>
              ))}
            </div>
          </div>
          
          {/* Feedback Text */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Additional Feedback (Optional)
            </label>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Share your thoughts on how we can improve..."
              style={{
                width: '100%',
                minHeight: '100px',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '0.9rem',
                fontFamily: 'inherit',
                resize: 'vertical'
              }}
              maxLength={1000}
            />
            <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.25rem' }}>
              {feedbackText.length}/1000 characters
            </p>
          </div>
          
          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button 
              onClick={handleSubmitRating}
              className="find-match-btn"
              disabled={sessionRating === 0 && matchmakingRating === 0}
              style={{
                opacity: (sessionRating === 0 && matchmakingRating === 0) ? 0.5 : 1,
                cursor: (sessionRating === 0 && matchmakingRating === 0) ? 'not-allowed' : 'pointer'
              }}
            >
              Submit
            </button>
            <button 
              onClick={handleSkipRating}
              className="logout-btn"
            >
              Skip
            </button>
          </div>
        </div>
        </>
      )}
    </div>
  );
}

export default App;