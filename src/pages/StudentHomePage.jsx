import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post, patch, del, postFormData } from '../utils/api.js';
import AudioPlayer from '../components/AudioPlayer.jsx';
import ThemeSwitcher from '../components/ThemeSwitcher.jsx';

const SECTION_ID = '043f0728-c357-4e72-b6ce-62823cc064b7';

const UI_STATES = {
  IDLE: 'IDLE',
  WAITING: 'WAITING',
  APPROVED: 'APPROVED',
  RECORDING: 'RECORDING',
  COMPLETED: 'COMPLETED',
};

export default function StudentHomePage() {
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [studentId, setStudentId] = useState(null);
  const [balance, setBalance] = useState(0);
  const [uiState, setUiState] = useState(UI_STATES.IDLE);
  const [raisedHandId, setRaisedHandId] = useState(null);
  const [recordingId, setRecordingId] = useState(null);
  const [topic, setTopic] = useState('');
  const [extraInfo, setExtraInfo] = useState('');
  const [discussionTopic, setDiscussionTopic] = useState('');
  const [discussionExtraInfo, setDiscussionExtraInfo] = useState('');
  const [audioUrl, setAudioUrl] = useState(null);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [micError, setMicError] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const [transcriptionStatus, setTranscriptionStatus] = useState(null);
  const [transcriptionError, setTranscriptionError] = useState(null);
  const [evaluation, setEvaluation] = useState(null);

  // Assignment submission workflow state
  const [activeTab, setActiveTab] = useState('PARTICIPATION'); // 'PARTICIPATION' | 'ASSIGNMENTS'
  const [studentAssignments, setStudentAssignments] = useState([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [submittingAssignId, setSubmittingAssignId] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState({});
  const [assignmentMessage, setAssignmentMessage] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const activePollSessionRef = useRef({ pollType: null, targetId: null });
  const pollTimerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioObjectUrlRef = useRef(null);
  const recordStartTimeRef = useRef(0);

  const revokeAudioUrl = () => {
    if (audioObjectUrlRef.current) {
      URL.revokeObjectURL(audioObjectUrlRef.current);
      audioObjectUrlRef.current = null;
    }
  };

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    activePollSessionRef.current = { pollType: null, targetId: null };
  };

  const resetSessionState = () => {
    stopPolling();
    revokeAudioUrl();
    setRaisedHandId(null);
    setRecordingId(null);
    setTopic('');
    setExtraInfo('');
    setAudioUrl(null);
    setRecordedDuration(0);
    setTranscript(null);
    setTranscriptionStatus(null);
    setTranscriptionError(null);
    setEvaluation(null);
    setMicError(null);
    setUiState(UI_STATES.IDLE);
  };

  // Requirement A & F: On initial login, mount, refresh, or return to page:
  // Start with NO current recording displayed. Only load user profile and balance.
  const loadRoster = useCallback(async () => {
    try {
      setLoadError(null);
      const token = localStorage.getItem('smarttoken_token');
      if (!token) {
        navigate('/login');
        return;
      }

      let payload = {};
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          while (base64.length % 4) base64 += '=';
          payload = JSON.parse(atob(base64));
        }
      } catch (tokenErr) {
        console.error('Failed to parse token payload:', tokenErr);
      }

      if (payload.exp && Date.now() >= payload.exp * 1000) {
        localStorage.removeItem('smarttoken_token');
        navigate('/login');
        return;
      }

      if (payload.role && payload.role !== 'STUDENT') {
        if (payload.role === 'FACULTY') {
          navigate('/participation');
          return;
        }
        if (payload.role === 'ADMIN') {
          navigate('/admin');
          return;
        }
      }

      const data = await get(`/api/sections/${SECTION_ID}/students`);
      const roster = data.students || [];
      const me = roster.find((s) => s.userId === payload.userId);
      if (me) {
        setStudentId(me.id);
        setStudent(me);
        setBalance(me.balance);
      } else {
        setLoadError(
          `Logged in as ${payload.email || 'user'}, but this user is not registered in this section's student roster.`
        );
      }
    } catch (e) {
      console.error('Failed to load roster:', e);
      if (e.message && e.message.includes('401')) {
        localStorage.removeItem('smarttoken_token');
        navigate('/login');
      } else {
        setLoadError(e.message || 'Failed to connect to backend server. Make sure the backend is running.');
      }
    }
  }, [navigate]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  const loadDiscussionTopic = useCallback(async () => {
    try {
      const data = await get(`/api/sections/${SECTION_ID}/participation/topic`);
      if (data) {
        setDiscussionTopic(data.topic || '');
        setDiscussionExtraInfo(data.extraInfo || '');
      }
    } catch (e) {
      // Non-blocking topic poll error
    }
  }, []);

  useEffect(() => {
    loadDiscussionTopic();
    const interval = setInterval(loadDiscussionTopic, 3000);
    return () => clearInterval(interval);
  }, [loadDiscussionTopic]);

  const loadStudentAssignments = async () => {
    try {
      setLoadingAssignments(true);
      const data = await get(`/api/sections/${SECTION_ID}/assignments`);
      const list = data.assignments || [];

      // Query each assignment detail for student's own submission
      const listWithSubmissions = await Promise.all(
        list.map(async (assign) => {
          try {
            const detail = await get(`/api/sections/${SECTION_ID}/assignments/${assign.id}`);
            return {
              ...assign,
              mySubmission: detail.assignment?.mySubmission || null,
            };
          } catch {
            return assign;
          }
        })
      );
      setStudentAssignments(listWithSubmissions);
    } catch (err) {
      console.error('Failed to load student assignments:', err);
    } finally {
      setLoadingAssignments(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'ASSIGNMENTS') {
      loadStudentAssignments();
    }
  }, [activeTab]);

  const handleStudentFileSubmit = async (assignId) => {
    const fileToSubmit = selectedFiles[assignId];
    if (!fileToSubmit) {
      alert('Please select an answer file to submit (PDF or DOCX).');
      return;
    }
    try {
      setSubmittingAssignId(assignId);
      setAssignmentMessage(null);
      const formData = new FormData();
      formData.append('file', fileToSubmit);
      await postFormData(`/api/sections/${SECTION_ID}/assignments/${assignId}/submissions`, formData);
      setAssignmentMessage({
        assignId,
        type: 'success',
        text: 'Assignment submitted successfully! AI evaluation is in progress for teacher review.',
      });
      setSelectedFiles((prev) => ({ ...prev, [assignId]: null }));
      await loadStudentAssignments();
    } catch (err) {
      setAssignmentMessage({
        assignId,
        type: 'error',
        text: err.message || 'Submission failed. Please try again.',
      });
    } finally {
      setSubmittingAssignId(null);
    }
  };

  // Requirement F: Clean up all polling timers, recorder, stream tracks, and object URLs on unmount
  useEffect(() => {
    return () => {
      stopPolling();
      revokeAudioUrl();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
    };
  }, []);

  /* =========================================================================
   * LEGACY RAISED-HAND CODE (Commented out per user request)
   * The teacher requested removing the raise hand requirement so students can
   * record audio and speak at any time without waiting for manual hand-raise approval.
   * Kept here for easy re-enablement if needed in the future.
   *
  const pollForApproval = (targetRaisedHandId, targetStudentId) => {
    activePollSessionRef.current = { pollType: 'APPROVAL', targetId: targetRaisedHandId };

    const tick = async () => {
      if (
        activePollSessionRef.current.pollType !== 'APPROVAL' ||
        activePollSessionRef.current.targetId !== targetRaisedHandId
      ) {
        return;
      }

      try {
        const resp = await get(
          `/api/sections/${SECTION_ID}/students/${targetStudentId}/participation/recording?raisedHandId=${targetRaisedHandId}`
        );

        if (
          activePollSessionRef.current.pollType !== 'APPROVAL' ||
          activePollSessionRef.current.targetId !== targetRaisedHandId
        ) {
          return;
        }

        if (resp.session && resp.session.status === 'APPROVED') {
          stopPolling();
          setRecordingId(resp.session.id);
          setTopic(resp.session.topic || '');
          setExtraInfo(resp.session.extraInfo || '');
          revokeAudioUrl();
          setAudioUrl(null);
          setRecordedDuration(0);
          setTranscript(null);
          setTranscriptionStatus(null);
          setTranscriptionError(null);
          setEvaluation(null);
          setUiState(UI_STATES.APPROVED);
          return;
        }
      } catch (e) {
        console.error('Polling for approval error:', e);
      }

      if (
        activePollSessionRef.current.pollType === 'APPROVAL' &&
        activePollSessionRef.current.targetId === targetRaisedHandId
      ) {
        pollTimerRef.current = setTimeout(tick, 2000);
      }
    };

    pollTimerRef.current = setTimeout(tick, 1500);
  };

  const handleRaiseHand = async () => {
    if (!studentId) return;
    try {
      resetSessionState();
      setMicError(null);
      setUiState(UI_STATES.WAITING);

      let newRaisedHandId;
      try {
        const resp = await post(`/api/sections/${SECTION_ID}/participation/raise`, { studentId });
        newRaisedHandId = resp.request.id;
      } catch (err) {
        const queueResp = await get(`/api/sections/${SECTION_ID}/participation/raised`);
        const existing = (queueResp.requests || []).find((r) => r.studentId === studentId);
        if (existing) {
          newRaisedHandId = existing.id;
        } else {
          throw err;
        }
      }

      setRaisedHandId(newRaisedHandId);
      pollForApproval(newRaisedHandId, studentId);
    } catch (e) {
      console.error('Raise hand failed:', e);
      setUiState(UI_STATES.IDLE);
      setMicError('Failed to raise hand. Please try again.');
    }
  };

  const handleCancel = async () => {
    stopPolling();
    if (raisedHandId) {
      try {
        await del(`/api/sections/${SECTION_ID}/participation/raised/${raisedHandId}`);
      } catch (e) {
        console.error('Cancel failed', e);
      }
    }
    resetSessionState();
  };
  ========================================================================= */

  // Poll for transcription & evaluation tied strictly to targetRecordingId (Requirement D & E)
  const pollForTranscription = (targetRecordingId) => {
    activePollSessionRef.current = { pollType: 'TRANSCRIPTION', targetId: targetRecordingId };

    const tick = async () => {
      if (
        activePollSessionRef.current.pollType !== 'TRANSCRIPTION' ||
        activePollSessionRef.current.targetId !== targetRecordingId
      ) {
        return;
      }

      try {
        const resp = await get(
          `/api/sections/${SECTION_ID}/participation/recordings/${targetRecordingId}/transcription`
        );

        if (
          activePollSessionRef.current.pollType !== 'TRANSCRIPTION' ||
          activePollSessionRef.current.targetId !== targetRecordingId
        ) {
          return;
        }

        if (resp.session) {
          const s = resp.session;
          if (s.audioUrl) {
            setAudioUrl(s.audioUrl);
          }
          setTranscript(s.transcript || null);
          setTranscriptionStatus(s.transcriptionStatus || null);
          setTranscriptionError(s.transcriptionError || null);

          if (s.evaluationStatus) {
            setEvaluation({
              status: s.evaluationStatus,
              relevant: s.evaluationRelevant,
              correct: s.evaluationCorrect,
              reason: s.evaluationReason,
              suggestedTokenChange: s.suggestedTokenChange,
              finalTokenChange: s.finalTokenChange,
              finalizedAt: s.finalizedAt,
              error: s.evaluationError,
            });

            if (s.finalizedAt) {
              try {
                const balData = await get(`/api/sections/${SECTION_ID}/students`);
                const me = (balData.students || []).find((st) => st.id === studentId);
                if (me) setBalance(me.balance);
              } catch {}
            }
          }

          const isTranscriptionDone = s.transcriptionStatus === 'COMPLETED' || s.transcriptionStatus === 'FAILED';
          const isEvaluationDone =
            s.transcriptionStatus === 'FAILED' ||
            s.evaluationStatus === 'COMPLETED' ||
            s.evaluationStatus === 'FINALIZED' ||
            s.evaluationStatus === 'FAILED';

          if (isTranscriptionDone && isEvaluationDone) {
            stopPolling();
            return;
          }
        }
      } catch (err) {
        console.error('Polling transcription error:', err);
      }

      if (
        activePollSessionRef.current.pollType === 'TRANSCRIPTION' &&
        activePollSessionRef.current.targetId === targetRecordingId
      ) {
        pollTimerRef.current = setTimeout(tick, 1500);
      }
    };

    pollTimerRef.current = setTimeout(tick, 1000);
  };

  // Direct Recording Start: Seamless participation allowing students to record anytime
  const handleStartRecording = async () => {
    setMicError(null);

    try {
      // 1. Request microphone access first
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // 2. Create direct recording session on backend
      const resp = await post(`/api/sections/${SECTION_ID}/participation/recordings`, {});
      const session = resp.session;
      if (!session || !session.id) {
        throw new Error('Failed to create participation recording session.');
      }

      setRecordingId(session.id);
      setTopic(session.topic || discussionTopic || '');
      setExtraInfo(session.extraInfo || discussionExtraInfo || '');
      revokeAudioUrl();
      setAudioUrl(null);
      setRecordedDuration(0);
      setTranscript(null);
      setTranscriptionStatus(null);
      setTranscriptionError(null);
      setEvaluation(null);

      // 3. Initialize MediaRecorder
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100);
      recordStartTimeRef.current = Date.now();
      setUiState(UI_STATES.RECORDING);
    } catch (err) {
      console.error('Microphone permission or recording start error:', err);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      setMicError(
        err.message || 'Microphone access denied. Please grant microphone permissions to record your response.'
      );
    }
  };

  // Requirement D: Stop recording, upload audio, and start single-session polling
  const handleStopRecording = async () => {
    if (!recordingId) return;

    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        await new Promise((resolve) => {
          mediaRecorderRef.current.onstop = resolve;
          mediaRecorderRef.current.stop();
        });
      }

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }

      const durationSec = recordStartTimeRef.current > 0
        ? (Date.now() - recordStartTimeRef.current) / 1000
        : 0;
      setRecordedDuration(durationSec);

      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      revokeAudioUrl();
      const localUrl = URL.createObjectURL(audioBlob);
      audioObjectUrlRef.current = localUrl;
      setAudioUrl(localUrl);

      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Audio = reader.result;
        try {
          const resp = await patch(
            `/api/sections/${SECTION_ID}/participation/recordings/${recordingId}/complete`,
            { audioBase64: base64Audio }
          );

          if (resp.session && resp.session.audioUrl) {
            setAudioUrl(resp.session.audioUrl);
            revokeAudioUrl();
          }

          setTranscriptionStatus(resp.session?.transcriptionStatus || 'PENDING');
          setUiState(UI_STATES.COMPLETED);

          // Poll ONLY for this session ID
          pollForTranscription(recordingId);
        } catch (e) {
          console.error('Failed to complete recording session on backend', e);
          setMicError('The recording was captured, but it could not be saved. Please try again.');
        }
      };
    } catch (e) {
      console.error('Stop recording error', e);
      setMicError('An error occurred while stopping the recording.');
    }
  };

  const handleBackToParticipation = () => {
    resetSessionState();
    navigate('/student');
  };

  const handleLogout = () => {
    stopPolling();
    revokeAudioUrl();
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    localStorage.removeItem('smarttoken_token');
    navigate('/login');
  };

  const STATUS_LABELS = {
    IDLE: 'Ready to Record',
    RECORDING: 'Recording in Progress…',
    COMPLETED: 'Response Submitted',
  };

  const renderActionButton = () => {
    switch (uiState) {
      case UI_STATES.IDLE:
        return (
          <button
            className="student-btn"
            onClick={handleStartRecording}
            style={{
              padding: '0.75rem 1.75rem',
              fontSize: '1rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: '#2563eb',
              boxShadow: '0 2px 4px rgba(37,99,235,0.2)',
            }}
          >
            🎙️ Start Speaking / Record Response
          </button>
        );
      /* LEGACY RAISE HAND ACTIONS (Kept commented out)
      case UI_STATES.WAITING:
        return (
          <button className="student-btn-cancel" onClick={handleCancel}>
            Cancel Hand
          </button>
        );
      case UI_STATES.APPROVED:
        return (
          <button className="student-btn" onClick={handleStartRecording}>
            Start Recording
          </button>
        );
      */
      case UI_STATES.RECORDING:
        return (
          <button
            className="student-btn-cancel"
            onClick={handleStopRecording}
            style={{
              padding: '0.75rem 1.75rem',
              fontSize: '1rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: '#dc2626',
              color: '#ffffff',
              boxShadow: '0 2px 4px rgba(220,38,38,0.25)',
            }}
          >
            ⏹️ Stop Recording & Submit
          </button>
        );
      case UI_STATES.COMPLETED:
        return (
          <button
            className="student-btn"
            onClick={resetSessionState}
            style={{
              padding: '0.65rem 1.25rem',
              fontSize: '0.95rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: '#2563eb',
            }}
          >
            🎙️ Speak Again / New Response
          </button>
        );
      default:
        return null;
    }
  };

  if (!student) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
        <div style={{ maxWidth: '480px', width: '100%', backgroundColor: '#ffffff', borderRadius: '12px', padding: '2rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -2px rgba(0,0,0,0.05)', textAlign: 'center' }}>
          {loadError ? (
            <>
              <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚠️</div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.5rem' }}>Unable to Load Student Profile</h2>
              <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>{loadError}</p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={loadRoster}
                  style={{ padding: '0.6rem 1.25rem', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  style={{ padding: '0.6rem 1.25rem', backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Log Out
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'inline-block', width: '36px', height: '36px', border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '1rem' }} />
              <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.25rem' }}>Loading Student Info...</h2>
              <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1.25rem' }}>Connecting to session and fetching roster</p>
              <button
                type="button"
                onClick={handleLogout}
                style={{ padding: '0.45rem 1rem', backgroundColor: 'transparent', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
              >
                Cancel / Back to Login
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div className="student-portal-card">
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem', gap: '0.75rem', alignItems: 'center' }}>
            <ThemeSwitcher />
            <button className="student-btn-cancel" onClick={handleLogout}>Logout</button>
          </div>
      <h2 className="student-portal-header">{student.name}</h2>
      <p className="student-id">
        Roll / ID: {student.studentIdNumber || student.studentId || student.id}
      </p>
      <p className="balance">Token Balance: {balance}</p>

      {/* Tabs: Spoken Participation vs Course Assignments */}
      <div style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0 1.25rem 0', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.65rem' }}>
        <button
          type="button"
          onClick={() => setActiveTab('PARTICIPATION')}
          style={{
            flex: 1,
            padding: '0.6rem 1rem',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: activeTab === 'PARTICIPATION' ? 'var(--primary-color, #2563eb)' : '#f1f5f9',
            color: activeTab === 'PARTICIPATION' ? '#ffffff' : '#475569',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          🙋 Spoken Participation
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('ASSIGNMENTS')}
          style={{
            flex: 1,
            padding: '0.6rem 1rem',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: activeTab === 'ASSIGNMENTS' ? 'var(--primary-color, #2563eb)' : '#f1f5f9',
            color: activeTab === 'ASSIGNMENTS' ? '#ffffff' : '#475569',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          📝 Course Assignments
        </button>
      </div>

      {activeTab === 'PARTICIPATION' && (
        <>
          {/* Active Discussion Topic Card */}
          <div
            style={{
              margin: '1rem 0 1.25rem 0',
              padding: '1rem',
              backgroundColor: '#f0f9ff',
              borderRadius: '8px',
              border: '1px solid #bae6fd',
              borderLeft: '5px solid #0284c7',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '1.1rem' }}>💡</span>
                <h4 style={{ margin: 0, color: '#0369a1', fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Current Discussion Topic
                </h4>
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, backgroundColor: '#e0f2fe', color: '#0369a1', padding: '0.2rem 0.55rem', borderRadius: '4px' }}>
                Open Floor
              </span>
            </div>
            <p style={{ margin: '0.2rem 0 0.35rem 0', fontWeight: 600, color: '#0f172a', fontSize: '1.05rem', lineHeight: 1.4 }}>
              {topic || discussionTopic || 'Open Classroom Discussion'}
            </p>
            {(extraInfo || discussionExtraInfo) ? (
              <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.88rem', color: '#334155', lineHeight: 1.45, borderTop: '1px dashed #bae6fd', paddingTop: '0.35rem' }}>
                📝 <strong>Guiding Prompt:</strong> {extraInfo || discussionExtraInfo}
              </p>
            ) : (
              <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.82rem', color: '#64748b' }}>
                Share your perspective, answer questions, or contribute anytime.
              </p>
            )}
          </div>

          <p className="status">Status: {STATUS_LABELS[uiState] || uiState}</p>

          {micError && (
            <div style={{ margin: '1rem 0', padding: '0.75rem', backgroundColor: '#fef2f2', color: '#dc2626', borderRadius: '6px', border: '1px solid #fca5a5', fontSize: '0.9rem' }}>
              ⚠️ {micError}
            </div>
          )}

          {uiState === UI_STATES.RECORDING && (
            <div style={{ margin: '1rem 0', padding: '0.75rem 1rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
              <span className="recording-dot" style={{ fontSize: '1.2rem' }}>🔴</span>
              <span style={{ color: '#b91c1c', fontWeight: 600, fontSize: '0.95rem' }}>
                Microphone is active — speak clearly! Click Stop when finished.
              </span>
            </div>
          )}

          <div className="action-container" style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', margin: '1.25rem 0' }}>
            {renderActionButton()}
          </div>

          {audioUrl && uiState === UI_STATES.COMPLETED && (
            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', textAlign: 'left' }}>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#475569' }}>Audio Recording Playback:</h4>
              <AudioPlayer src={audioUrl} initialDuration={recordedDuration} />
            </div>
          )}

          {uiState === UI_STATES.COMPLETED && transcriptionStatus && (
            <div style={{ marginTop: '1rem', textAlign: 'left' }}>
              <h4 style={{ margin: '0 0 0.4rem 0', fontSize: '0.95rem', color: '#1e293b' }}>Transcript</h4>
              {transcriptionStatus === 'COMPLETED' && (
                <p style={{ margin: 0, padding: '0.75rem', backgroundColor: '#f1f5f9', borderRadius: '6px', color: '#1e293b', fontSize: '0.9rem', lineHeight: 1.5 }}>
                  {transcript || '(Empty transcript)'}
                </p>
              )}
              {(transcriptionStatus === 'PENDING' || transcriptionStatus === 'PROCESSING') && (
                <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>Transcription is processing…</p>
              )}
              {transcriptionStatus === 'FAILED' && (
                <p style={{ margin: 0, color: '#dc2626', fontSize: '0.9rem' }}>
                  Transcription failed: {transcriptionError || 'Please try again later.'}
                </p>
              )}
            </div>
          )}

          {uiState === UI_STATES.COMPLETED && (
            <div style={{ marginTop: '1rem', padding: '0.85rem', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', textAlign: 'left' }}>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', color: '#1e293b' }}>Evaluation</h4>
              {(!evaluation || evaluation.status === 'PENDING' || evaluation.status === 'PROCESSING') && (
                <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>
                  {transcriptionStatus === 'COMPLETED' ? 'Evaluation is processing…' : 'Waiting for transcript to evaluate…'}
                </p>
              )}
              {evaluation && (evaluation.status === 'COMPLETED' || evaluation.status === 'FINALIZED') && (
                <div>
                  <p style={{ margin: '0 0 0.25rem 0', fontWeight: 600, color: '#334155', fontSize: '0.9rem' }}>
                    {evaluation.relevant ? 'Relevant' : 'Not relevant'} • {evaluation.correct ? 'Correct' : 'Needs improvement'}
                  </p>
                  <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#475569', lineHeight: 1.4 }}>
                    {evaluation.reason}
                  </p>
                  {evaluation.finalizedAt ? (
                    <div style={{ color: '#166534', fontWeight: 600, fontSize: '0.9rem' }}>
                      Final Award: {evaluation.finalTokenChange > 0 ? `+${evaluation.finalTokenChange}` : evaluation.finalTokenChange} token(s)
                    </div>
                  ) : (
                    <div style={{ color: '#0284c7', fontSize: '0.85rem' }}>
                      Faculty review pending (Suggested change: {evaluation.suggestedTokenChange > 0 ? `+${evaluation.suggestedTokenChange}` : evaluation.suggestedTokenChange})
                    </div>
                  )}
                </div>
              )}
              {evaluation && evaluation.status === 'FAILED' && (
                <p style={{ margin: 0, color: '#dc2626', fontSize: '0.85rem' }}>
                  Evaluation failed: {evaluation.error || 'Please try again later.'}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {activeTab === 'ASSIGNMENTS' && (
        <div style={{ textAlign: 'left', marginTop: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#1e293b' }}>Course Assignments</h3>
            <button
              onClick={loadStudentAssignments}
              disabled={loadingAssignments}
              style={{
                fontSize: '0.8rem',
                padding: '0.35rem 0.75rem',
                backgroundColor: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              {loadingAssignments ? 'Refreshing…' : '↻ Refresh'}
            </button>
          </div>

          {loadingAssignments && studentAssignments.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Loading course assignments…</p>
          ) : studentAssignments.length === 0 ? (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#64748b', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
              <p style={{ margin: '0 0 0.35rem 0', fontWeight: 600 }}>No assignments available right now</p>
              <p style={{ margin: 0, fontSize: '0.85rem' }}>Your faculty has not posted any active assignments yet.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {studentAssignments.map((assign) => {
                const sub = assign.mySubmission
                const isSubmitting = submittingAssignId === assign.id
                const isApproved = sub?.status === 'APPROVED'
                const msg = assignmentMessage && assignmentMessage.assignId === assign.id ? assignmentMessage : null

                return (
                  <div
                    key={assign.id}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '1.1rem',
                      backgroundColor: '#ffffff',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <h4 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>{assign.title}</h4>
                      <span
                        style={{
                          fontSize: '0.78rem',
                          padding: '0.2rem 0.55rem',
                          borderRadius: '9999px',
                          backgroundColor: '#eff6ff',
                          color: '#1d4ed8',
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Max {assign.maxTokens} Tokens
                      </span>
                    </div>

                    {assign.extraInfo && (
                      <p style={{ margin: '0 0 0.65rem 0', fontSize: '0.85rem', color: '#475569', lineHeight: 1.4 }}>
                        {assign.extraInfo}
                      </p>
                    )}

                    {assign.fileUrl && (
                      <div style={{ marginBottom: '0.75rem' }}>
                        <a
                          href={assign.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: '0.82rem',
                            color: '#2563eb',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            fontWeight: 500,
                          }}
                        >
                          📄 Download Assignment Problem ({assign.fileName || 'Document'})
                        </a>
                      </div>
                    )}

                    {/* Submission status or upload form */}
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
                      {sub ? (
                        <div style={{ backgroundColor: isApproved ? '#f0fdf4' : '#fffbeb', border: `1px solid ${isApproved ? '#bbf7d0' : '#fde68a'}`, borderRadius: '6px', padding: '0.85rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: isApproved ? '#166534' : '#92400e' }}>
                              {isApproved ? '✓ Submission Graded & Approved' : '⏳ Submission Under Review'}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              {new Date(sub.submittedAt || sub.createdAt).toLocaleDateString()}
                            </span>
                          </div>

                          <div style={{ fontSize: '0.82rem', color: '#334155', marginBottom: '0.35rem' }}>
                            File: <a href={sub.fileUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'underline' }}>{sub.fileName}</a>
                          </div>

                          {isApproved && (
                            <div style={{ marginTop: '0.4rem', fontWeight: 700, color: '#166534', fontSize: '0.9rem' }}>
                              Awarded: +{sub.approvedTokens} Tokens
                            </div>
                          )}

                          {sub.reason && (
                            <div style={{ marginTop: '0.4rem', fontSize: '0.82rem', color: '#475569', fontStyle: 'italic' }}>
                              AI feedback: "{sub.reason}"
                            </div>
                          )}

                          {sub.evaluationStatus === 'PROCESSING' && (
                            <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: '#0284c7' }}>
                              🤖 AI is evaluating your document for the instructor…
                            </div>
                          )}

                          {!isApproved && (
                            <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px dashed #fde68a' }}>
                              <p style={{ margin: '0 0 0.4rem 0', fontSize: '0.78rem', color: '#78350f' }}>
                                Need to re-submit? Choose a replacement file:
                              </p>
                              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                <input
                                  type="file"
                                  accept=".pdf,.docx,.doc,.txt"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0] || null
                                    setSelectedFiles((prev) => ({ ...prev, [assign.id]: f }))
                                  }}
                                  style={{ fontSize: '0.8rem' }}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleStudentFileSubmit(assign.id)}
                                  disabled={isSubmitting || !selectedFiles[assign.id]}
                                  style={{
                                    padding: '0.35rem 0.75rem',
                                    borderRadius: '4px',
                                    backgroundColor: '#2563eb',
                                    color: '#fff',
                                    border: 'none',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    opacity: isSubmitting || !selectedFiles[assign.id] ? 0.6 : 1,
                                  }}
                                >
                                  {isSubmitting ? 'Uploading…' : 'Re-submit Answer'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                            Submit your answer (PDF or DOCX):
                          </p>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <input
                              type="file"
                              accept=".pdf,.docx,.doc,.txt"
                              onChange={(e) => {
                                const f = e.target.files?.[0] || null
                                setSelectedFiles((prev) => ({ ...prev, [assign.id]: f }))
                              }}
                              style={{ fontSize: '0.82rem' }}
                            />
                            <button
                              type="button"
                              onClick={() => handleStudentFileSubmit(assign.id)}
                              disabled={isSubmitting || !selectedFiles[assign.id]}
                              style={{
                                padding: '0.45rem 0.9rem',
                                borderRadius: '6px',
                                backgroundColor: 'var(--primary-color, #2563eb)',
                                color: '#ffffff',
                                border: 'none',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                opacity: isSubmitting || !selectedFiles[assign.id] ? 0.6 : 1,
                              }}
                            >
                              {isSubmitting ? 'Submitting…' : 'Submit Answer'}
                            </button>
                          </div>
                        </div>
                      )}

                      {msg && (
                        <div
                          style={{
                            marginTop: '0.5rem',
                            padding: '0.45rem 0.65rem',
                            borderRadius: '4px',
                            fontSize: '0.8rem',
                            backgroundColor: msg.type === 'success' ? '#ecfdf5' : '#fef2f2',
                            color: msg.type === 'success' ? '#047857' : '#dc2626',
                          }}
                        >
                          {msg.type === 'success' ? '✓ ' : '⚠️ '}
                          {msg.text}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
