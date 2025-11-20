import React, { useState, useEffect, useRef } from 'react';

// Default timer settings in seconds
const DEFAULT_POMODORO_TIME = 25 * 60;
const DEFAULT_SHORT_BREAK_TIME = 5 * 60;
const DEFAULT_LONG_BREAK_TIME = 15 * 60;

// Timer presets
const TIMER_PRESETS = {
  pomodoro: [
    { name: 'Classic', time: 25 * 60 },
    { name: 'Short', time: 15 * 60 },
    { name: 'Long', time: 45 * 60 },
    { name: 'Custom', time: null }
  ],
  short: [
    { name: 'Quick', time: 3 * 60 },
    { name: 'Standard', time: 5 * 60 },
    { name: 'Extended', time: 10 * 60 }
  ],
  long: [
    { name: 'Short', time: 10 * 60 },
    { name: 'Standard', time: 15 * 60 },
    { name: 'Extended', time: 30 * 60 }
  ]
};

// Motivational messages
const MOTIVATIONAL_MESSAGES = {
  pomodoro: [
    "You've got this! 💪",
    "Stay focused! 🎯",
    "One pomodoro at a time! ⏱️",
    "You're doing great! 🌟",
    "Keep pushing forward! 🚀"
  ],
  short: [
    "Time for a quick break! ☕",
    "You've earned this! 🎉",
    "Relax and recharge! 😌",
    "Take a breather! 🌬️"
  ],
  long: [
    "Well deserved break! 🏖️",
    "Time to recharge! 🔋",
    "You've earned a long break! 🎊",
    "Relax and come back stronger! 💪"
  ]
};

// Helper to format time
const formatTime = (timeInSeconds) => {
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = timeInSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

// Helper to play notification sound
const playNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (error) {
    console.log('Could not play sound:', error);
  }
};

function PomodoroTimer({ socket, sessionRoom, onPomodoroComplete }) {
  const [timeRemaining, setTimeRemaining] = useState(DEFAULT_POMODORO_TIME);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState('pomodoro');
  const [hasCompletedPomodoro, setHasCompletedPomodoro] = useState(false);
  const [pomodoroCount, setPomodoroCount] = useState(0);
  const [autoStartBreaks, setAutoStartBreaks] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [customDurations, setCustomDurations] = useState({
    pomodoro: DEFAULT_POMODORO_TIME,
    short: DEFAULT_SHORT_BREAK_TIME,
    long: DEFAULT_LONG_BREAK_TIME
  });
  const [selectedPreset, setSelectedPreset] = useState({ pomodoro: 0, short: 1, long: 1 });
  const [sessionGoal, setSessionGoal] = useState(4); // Default goal: 4 pomodoros
  const [currentMessage, setCurrentMessage] = useState('');
  const notificationPermissionRef = useRef(null);

  // Get current duration based on mode and preset
  const getCurrentDuration = () => {
    const preset = TIMER_PRESETS[mode][selectedPreset[mode]];
    if (preset && preset.time !== null) {
      return preset.time;
    }
    return customDurations[mode];
  };

  // Initialize timer duration
  useEffect(() => {
    setTimeRemaining(getCurrentDuration());
  }, [mode, selectedPreset, customDurations]);

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        notificationPermissionRef.current = permission;
      });
    } else if ('Notification' in window) {
      notificationPermissionRef.current = Notification.permission;
    }
  }, []);

  // Show browser notification
  const showNotification = (title, body) => {
    if ('Notification' in window && notificationPermissionRef.current === 'granted') {
      new Notification(title, {
        body: body,
        icon: '/favicon.ico',
        badge: '/favicon.ico'
      });
    }
  };

  // Calculate progress percentage
  const getProgress = () => {
    const totalTime = getCurrentDuration();
    return ((totalTime - timeRemaining) / totalTime) * 100;
  };

  // Calculate angle for circular progress
  const getProgressAngle = () => {
    return (getProgress() / 100) * 360;
  };

  // This is the local countdown timer
  useEffect(() => {
    let interval = null;
    if (isRunning && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining((prevTime) => {
          const newTime = prevTime - 1;
          
          // Show motivational message at certain intervals
          if (newTime > 0 && newTime % 300 === 0) { // Every 5 minutes
            const messages = MOTIVATIONAL_MESSAGES[mode];
            setCurrentMessage(messages[Math.floor(Math.random() * messages.length)]);
            setTimeout(() => setCurrentMessage(''), 3000);
          }
          
          return newTime;
        });
      }, 1000);
    } else if (isRunning && timeRemaining === 0) {
      // Handle timer completion
      setIsRunning(false);
      
      // Play sound and show notification
      playNotificationSound();
      
      if (mode === 'pomodoro') {
        const newCount = pomodoroCount + 1;
        setPomodoroCount(newCount);
        setHasCompletedPomodoro(true);
        
        // Show completion notification
        showNotification('Pomodoro Complete! 🎉', `You've completed ${newCount} pomodoro(s)! Time for a break.`);
        
        // Emit to server
        socket.emit('pomodoro_completed', {
          room_id: sessionRoom
        });
        
        // Call the callback if provided
        if (onPomodoroComplete) {
          onPomodoroComplete();
        }
        
        // Auto-start break if enabled
        if (autoStartBreaks) {
          setTimeout(() => {
            const breakMode = newCount % 4 === 0 ? 'long' : 'short';
            handleSetMode(breakMode, true);
            handleStartPause();
          }, 2000);
        }
      } else {
        // Break completed
        showNotification('Break Complete! ⏱️', 'Time to get back to work!');
        
        // Auto-start next pomodoro if enabled
        if (autoStartBreaks) {
          setTimeout(() => {
            handleSetMode('pomodoro', true);
            handleStartPause();
          }, 2000);
        }
      }
    }
    return () => clearInterval(interval);
  }, [isRunning, timeRemaining, mode, pomodoroCount, autoStartBreaks, socket, sessionRoom, onPomodoroComplete, selectedPreset, customDurations]);

  // This is for syncing with the server
  useEffect(() => {
    // Listen for updates from other users
    const handleTimerUpdate = (data) => {
      console.log('Timer update received:', data);
      switch (data.action) {
        case 'start':
          setTimeRemaining(data.time || timeRemaining);
          setIsRunning(true);
          break;
        case 'pause':
          setIsRunning(false);
          break;
        case 'reset':
          // Always use the provided time from the sender to ensure both users reset to the same value
          // The sender sends the full duration for their current mode
          let resetTime;
          let targetMode = data.mode || mode;
          
          if (data.time !== null && data.time !== undefined) {
            // Use the exact time sent by the sender (this is the full duration for sender's mode)
            resetTime = data.time;
          } else {
            // Fallback: calculate based on target mode
            const targetPreset = TIMER_PRESETS[targetMode][selectedPreset[targetMode]];
            resetTime = (targetPreset && targetPreset.time !== null) 
              ? targetPreset.time 
              : customDurations[targetMode];
          }
          
          console.log(`🔄 Reset received: time=${resetTime}, mode=${targetMode} (resetting to 0% progress)`);
          
          // Update mode if provided and different
          if (data.mode && data.mode !== mode) {
            setMode(data.mode);
          }
          
          // Reset to the exact time (full duration = 0% progress)
          setTimeRemaining(resetTime);
          setIsRunning(false);
          break;
        case 'skip':
          setTimeRemaining(0);
          setIsRunning(true); // Trigger completion
          break;
        case 'set_mode':
          setTimeRemaining(data.time);
          if (data.mode) setMode(data.mode);
          setIsRunning(false);
          break;
      }
    };

    socket.on('timer_update', handleTimerUpdate);

    // Clean up listener
    return () => {
      socket.off('timer_update', handleTimerUpdate);
    };
  }, [socket, mode, selectedPreset, customDurations, timeRemaining]);

  // --- Control Handlers (emit events) ---

  const sendTimerAction = (action, newTime = null, newMode = mode) => {
    const timeToSend = newTime !== null && newTime !== undefined ? newTime : timeRemaining;
    console.log(`📤 Sending timer action: ${action}, time: ${timeToSend}, mode: ${newMode}`);
    socket.emit('timer_action', {
      room_id: sessionRoom,
      action: action,
      time: timeToSend,
      mode: newMode,
    });
  };

  const handleStartPause = () => {
    if (isRunning) {
      sendTimerAction('pause');
    } else {
      sendTimerAction('start', timeRemaining);
    }
  };

  const handleReset = () => {
    const resetTime = getCurrentDuration();
    console.log(`🔄 Resetting timer: time=${resetTime}, mode=${mode} (will reset to 0% progress)`);
    
    // Reset locally first for immediate feedback
    setTimeRemaining(resetTime);
    setIsRunning(false);
    
    // Send reset action with the exact full duration for current mode
    // This ensures both users reset to the same time and 0% progress
    sendTimerAction('reset', resetTime, mode);
  };

  const handleSkip = () => {
    sendTimerAction('skip', 0, mode);
    // The timer will complete naturally when it reaches 0
  };

  const handleSetMode = (newMode, silent = false) => {
    let newTime;
    const preset = TIMER_PRESETS[newMode][selectedPreset[newMode]];
    if (preset && preset.time !== null) {
      newTime = preset.time;
    } else {
      newTime = customDurations[newMode];
    }
    
    if (newMode === 'pomodoro') {
      setHasCompletedPomodoro(false);
    }
    
    setMode(newMode);
    setTimeRemaining(newTime);
    
    if (!silent) {
      sendTimerAction('set_mode', newTime, newMode);
    }
  };

  const handlePresetChange = (newPresetIndex) => {
    setSelectedPreset(prev => ({
      ...prev,
      [mode]: newPresetIndex
    }));
    const preset = TIMER_PRESETS[mode][newPresetIndex];
    if (preset && preset.time !== null) {
      setTimeRemaining(preset.time);
      sendTimerAction('set_mode', preset.time, mode);
    }
  };

  const handleCustomDurationChange = (newDuration) => {
    setCustomDurations(prev => ({
      ...prev,
      [mode]: newDuration
    }));
    setTimeRemaining(newDuration);
    sendTimerAction('set_mode', newDuration, mode);
  };

  // Get mode color
  const getModeColor = () => {
    switch (mode) {
      case 'pomodoro':
        return '#e74c3c';
      case 'short':
        return '#3498db';
      case 'long':
        return '#2ecc71';
      default:
        return '#667eea';
    }
  };

  // Get mode emoji
  const getModeEmoji = () => {
    switch (mode) {
      case 'pomodoro':
        return '🍅';
      case 'short':
        return '☕';
      case 'long':
        return '🏖️';
      default:
        return '⏱️';
    }
  };

  const progress = getProgress();
  const progressAngle = getProgressAngle();
  const modeColor = getModeColor();
  const goalProgress = (pomodoroCount / sessionGoal) * 100;

  return (
    <div className="pomodoro-timer" style={{ position: 'relative' }}>
      {/* Header with stats */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '1.5rem' }}>{getModeEmoji()}</span>
          <div>
            <div style={{ fontSize: '0.9rem', color: '#666', fontWeight: '500' }}>
              {mode === 'pomodoro' ? 'Focus Time' : mode === 'short' ? 'Short Break' : 'Long Break'}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#999' }}>
              {pomodoroCount} pomodoro{pomodoroCount !== 1 ? 's' : ''} today
            </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {/* Session Goal Progress */}
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'flex-end',
            fontSize: '0.85rem'
          }}>
            <div style={{ color: '#666' }}>
              Goal: {pomodoroCount}/{sessionGoal}
            </div>
            <div style={{
              width: '100px',
              height: '6px',
              background: '#e0e0e0',
              borderRadius: '3px',
              overflow: 'hidden',
              marginTop: '0.25rem'
            }}>
              <div style={{
                width: `${Math.min(goalProgress, 100)}%`,
                height: '100%',
                background: modeColor,
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>
          
          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{
              padding: '0.5rem',
              background: 'transparent',
              border: '1px solid #ddd',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '1.2rem'
            }}
            title="Settings"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div style={{
          background: 'rgba(255, 255, 255, 0.95)',
          padding: '1.5rem',
          borderRadius: '12px',
          marginBottom: '1.5rem',
          border: '2px solid #e0e0e0'
        }}>
          <h4 style={{ marginTop: 0, marginBottom: '1rem' }}>Timer Settings</h4>
          
          {/* Presets */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '500' }}>
              {mode === 'pomodoro' ? 'Pomodoro' : mode === 'short' ? 'Short Break' : 'Long Break'} Duration
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {TIMER_PRESETS[mode].map((preset, index) => (
                <button
                  key={index}
                  onClick={() => {
                    if (preset.time === null) {
                      // Custom - show input
                      const minutes = prompt('Enter custom duration in minutes:', Math.floor(customDurations[mode] / 60));
                      if (minutes && !isNaN(minutes) && minutes > 0) {
                        handleCustomDurationChange(parseInt(minutes) * 60);
                      }
                    } else {
                      handlePresetChange(index);
                    }
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    background: selectedPreset[mode] === index ? modeColor : '#f0f0f0',
                    color: selectedPreset[mode] === index ? 'white' : '#333',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: selectedPreset[mode] === index ? '600' : '400'
                  }}
                >
                  {preset.name} {preset.time ? `(${Math.floor(preset.time / 60)}m)` : ''}
                </button>
              ))}
            </div>
          </div>

          {/* Auto-start breaks */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '1rem'
          }}>
            <label style={{ fontSize: '0.9rem', fontWeight: '500' }}>
              Auto-start breaks
            </label>
            <button
              onClick={() => setAutoStartBreaks(!autoStartBreaks)}
              style={{
                padding: '0.25rem 0.75rem',
                background: autoStartBreaks ? modeColor : '#e0e0e0',
                color: autoStartBreaks ? 'white' : '#666',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              {autoStartBreaks ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Session Goal */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '500' }}>
              Session Goal (pomodoros)
            </label>
            <input
              type="number"
              min="1"
              max="20"
              value={sessionGoal}
              onChange={(e) => setSessionGoal(parseInt(e.target.value) || 4)}
              style={{
                width: '100px',
                padding: '0.5rem',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '0.9rem'
              }}
            />
          </div>
        </div>
      )}

      {/* Motivational Message */}
      {currentMessage && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(102, 126, 234, 0.95)',
          color: 'white',
          padding: '1rem 2rem',
          borderRadius: '12px',
          fontSize: '1.1rem',
          fontWeight: '600',
          zIndex: 10,
          animation: 'fadeInOut 3s ease-in-out',
          pointerEvents: 'none'
        }}>
          {currentMessage}
        </div>
      )}

      {/* Mode Selection */}
      <div className="timer-modes" style={{ 
        display: 'flex', 
        gap: '0.5rem', 
        marginBottom: '1.5rem',
        justifyContent: 'center'
      }}>
        <button 
          onClick={() => handleSetMode('pomodoro')} 
          className={mode === 'pomodoro' ? 'active' : ''}
          style={{
            background: mode === 'pomodoro' ? '#e74c3c' : '#f0f0f0',
            color: mode === 'pomodoro' ? 'white' : '#333',
            border: 'none',
            padding: '0.75rem 1.5rem',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '600',
            transition: 'all 0.3s ease'
          }}
        >
          🍅 Pomodoro
        </button>
        <button 
          onClick={() => handleSetMode('short')} 
          className={mode === 'short' ? 'active' : ''}
          style={{
            background: mode === 'short' ? '#3498db' : '#f0f0f0',
            color: mode === 'short' ? 'white' : '#333',
            border: 'none',
            padding: '0.75rem 1.5rem',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '600',
            transition: 'all 0.3s ease'
          }}
        >
          ☕ Short Break
        </button>
        <button 
          onClick={() => handleSetMode('long')} 
          className={mode === 'long' ? 'active' : ''}
          style={{
            background: mode === 'long' ? '#2ecc71' : '#f0f0f0',
            color: mode === 'long' ? 'white' : '#333',
            border: 'none',
            padding: '0.75rem 1.5rem',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '600',
            transition: 'all 0.3s ease'
          }}
        >
          🏖️ Long Break
        </button>
      </div>

      {/* Circular Progress and Timer Display */}
      <div style={{ 
        position: 'relative', 
        width: '280px', 
        height: '280px', 
        margin: '2rem auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {/* Circular Progress Background */}
        <svg width="280" height="280" style={{ position: 'absolute', transform: 'rotate(-90deg)' }}>
          <circle
            cx="140"
            cy="140"
            r="130"
            fill="none"
            stroke="#e0e0e0"
            strokeWidth="12"
          />
          <circle
            cx="140"
            cy="140"
            r="130"
            fill="none"
            stroke={modeColor}
            strokeWidth="12"
            strokeDasharray={`${2 * Math.PI * 130}`}
            strokeDashoffset={`${2 * Math.PI * 130 * (1 - progress / 100)}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
        
        {/* Timer Display */}
        <div style={{ 
          position: 'relative', 
          zIndex: 2,
          textAlign: 'center'
        }}>
          <div className="timer-display" style={{ 
            fontSize: '3.5rem', 
            fontWeight: '700',
            color: modeColor,
            marginBottom: '0.5rem',
            fontVariantNumeric: 'tabular-nums'
          }}>
            {formatTime(timeRemaining)}
          </div>
          <div style={{ 
            fontSize: '1rem', 
            color: '#666',
            fontWeight: '500'
          }}>
            {Math.round(progress)}% Complete
          </div>
        </div>
      </div>

      {/* Timer Controls */}
      <div className="timer-controls" style={{ 
        display: 'flex', 
        gap: '0.75rem', 
        justifyContent: 'center',
        marginTop: '2rem'
      }}>
        <button 
          onClick={handleReset}
          className="reset-btn"
          style={{
            padding: '0.75rem 1.5rem',
            background: '#f0f0f0',
            color: '#333',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '0.9rem',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => e.target.style.background = '#e0e0e0'}
          onMouseLeave={(e) => e.target.style.background = '#f0f0f0'}
        >
          ↻ Reset
        </button>
        <button 
          onClick={handleStartPause} 
          className="start-pause-btn"
          style={{
            padding: '1rem 3rem',
            background: isRunning ? '#e74c3c' : modeColor,
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1.125rem',
            fontWeight: '700',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            boxShadow: isRunning ? '0 4px 15px rgba(231, 76, 60, 0.4)' : `0 4px 15px ${modeColor}40`
          }}
        >
          {isRunning ? '⏸ Pause' : '▶ Start'}
        </button>
        <button 
          onClick={handleSkip}
          className="skip-btn"
          style={{
            padding: '0.75rem 1.5rem',
            background: '#f0f0f0',
            color: '#333',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '0.9rem',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => e.target.style.background = '#e0e0e0'}
          onMouseLeave={(e) => e.target.style.background = '#f0f0f0'}
        >
          ⏭ Skip
        </button>
      </div>

      {/* Focus Mode Indicator */}
      {isRunning && (
        <div style={{
          marginTop: '1.5rem',
          padding: '0.75rem',
          background: 'rgba(231, 76, 60, 0.1)',
          borderRadius: '8px',
          textAlign: 'center',
          color: '#e74c3c',
          fontWeight: '600',
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem'
        }}>
          <span>🔴</span>
          <span>Focus Mode Active</span>
        </div>
      )}

      {/* Break Suggestion */}
      {pomodoroCount > 0 && pomodoroCount % 4 === 0 && mode === 'pomodoro' && !isRunning && (
        <div style={{
          marginTop: '1rem',
          padding: '0.75rem',
          background: 'rgba(46, 204, 113, 0.1)',
          borderRadius: '8px',
          textAlign: 'center',
          color: '#2ecc71',
          fontSize: '0.85rem'
        }}>
          💡 You've completed {pomodoroCount} pomodoro{pomodoroCount !== 1 ? 's' : ''}! Consider taking a long break.
        </div>
      )}
    </div>
  );
}

export default PomodoroTimer;
