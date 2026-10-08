import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post, patch, del } from '../utils/api.js';

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
  const [audioUrl, setAudioUrl] = useState(null);
  const [micError, setMicError] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const [transcriptionStatus, setTranscriptionStatus] = useState(null);
  const [transcriptionError, setTranscriptionError] = useState(null);

  const pollTimer = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Load student roster on mount and pick our demo student
  useEffect(() => {
    async function loadRoster() {
      try {
        const data = await get(`/api/sections/${SECTION_ID}/students`);
        const roster = data.students || [];
        const token = localStorage.getItem('smarttoken_token');
        const payload = token ? JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) : {};
        const me = roster.find((s) => s.userId === payload.userId);
        if (me) {
          setStudentId(me.id);
          setStudent(me);
          setBalance(me.balance);
          const current = await get(`/api/sections/${SECTION_ID}/students/${me.id}/participation/recording`);
          if (current.session) {
            const session = current.session;
            setRecordingId(session.id);
            setTopic(session.topic || '');
            setExtraInfo(session.extraInfo || '');
            setAudioUrl(session.audioUrl || null);
            setTranscript(session.transcript || null);
            setTranscriptionStatus(session.transcriptionStatus || null);
            setTranscriptionError(session.transcriptionError || null);
            if (session.status === 'APPROVED') setUiState(UI_STATES.APPROVED);
            if (session.status === 'RECORDING') setUiState(UI_STATES.RECORDING);
            if (session.status === 'COMPLETED') setUiState(UI_STATES.COMPLETED);
          }
        }
      } catch (e) {
        console.error('Failed to load roster', e);
      }
    }
    loadRoster();
  }, []);

  // Clean up polling and stream on unmount
  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const startPolling = () => {
    if (pollTimer.current) clearInterval(pollTimer.current)
    const pollForApproval = async () => {
      try {
        const resp = await get(
          `/api/sections/${SECTION_ID}/students/${studentId}/participation/recording`
        );
        if (resp.session) {
          const { id, status, topic: t, extraInfo: ei, audioUrl: au, transcript: text, transcriptionStatus: ts, transcriptionError: te } = resp.session;
          setRecordingId(id);
          if (t) setTopic(t);
          if (ei) setExtraInfo(ei);
          if (au) setAudioUrl(au);
          setTranscript(text || null);
          setTranscriptionStatus(ts || null);
          setTranscriptionError(te || null);

          if (status === 'APPROVED') {
            setUiState(UI_STATES.APPROVED);
            clearInterval(pollTimer.current);
            pollTimer.current = null;
          } else if (status === 'RECORDING') {
            setUiState(UI_STATES.RECORDING);
          } else if (status === 'COMPLETED') {
            setUiState(UI_STATES.COMPLETED);
          }
        }
      } catch (e) {
        console.error('Polling error', e);
      }
    }
    pollForApproval()
    pollTimer.current = setInterval(pollForApproval, 2500)
  };

  const handleRaiseHand = async () => {
    if (!studentId) return;
    try {
      setMicError(null);
      const resp = await post(
        `/api/sections/${SECTION_ID}/participation/raise`,
        { studentId }
      );
      setRaisedHandId(resp.request.id);
      setUiState(UI_STATES.WAITING);
      startPolling();
    } catch (e) {
      console.error('Raise hand failed', e);
    }
  };

  const handleCancel = async () => {
    if (!raisedHandId) return;
    try {
      await del(
        `/api/sections/${SECTION_ID}/participation/raised/${raisedHandId}`
      );
      setUiState(UI_STATES.IDLE);
      setRaisedHandId(null);
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    } catch (e) {
      console.error('Cancel failed', e);
    }
  };

  const handleStartRecording = async () => {
    if (!recordingId) return;
    setMicError(null);

    // Request microphone permission only when user clicks Start Recording
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100);

      // Notify backend that recording started
      await patch(
        `/api/sections/${SECTION_ID}/participation/recordings/${recordingId}/start`
      );
      setUiState(UI_STATES.RECORDING);
    } catch (err) {
      console.error('Microphone permission or start error:', err);
      setMicError('Microphone access denied. Please grant microphone permissions to record your response.');
    }
  };

  const handleStopRecording = async () => {
    if (!recordingId) return;

    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        // Handle mediaRecorder stop and blob generation
        await new Promise((resolve) => {
          mediaRecorderRef.current.onstop = resolve;
          mediaRecorderRef.current.stop();
        });
      }

      // Stop microphone stream tracks so mic light turns off
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }

      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const localUrl = URL.createObjectURL(audioBlob);
      setAudioUrl(localUrl);

      // Convert Blob to base64 for API transmission
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
          }
          setTranscriptionStatus(resp.session?.transcriptionStatus || 'PENDING');
          setUiState(UI_STATES.COMPLETED);
        } catch (e) {
          console.error('Failed to complete recording session on backend', e);
          setMicError('The recording was captured, but it could not be saved. Please try again.');
          return;
        }
        setUiState(UI_STATES.COMPLETED);
        // Keep polling after upload so ASR/Gemini terminal status reaches the UI.
        startPolling();
      };
    } catch (e) {
      console.error('Stop recording error', e);
    }
  };

  const handleBackToParticipation = () => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    setUiState(UI_STATES.IDLE);
    setRaisedHandId(null);
    setRecordingId(null);
    setTopic('');
    setExtraInfo('');
    setAudioUrl(null);
    setTranscript(null);
    setTranscriptionStatus(null);
    setTranscriptionError(null);
    navigate('/student');
  };

  const handleLogout = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    localStorage.removeItem('smarttoken_token');
    navigate('/login');
  };

  // Mapping friendly status text
  const STATUS_LABELS = {
    IDLE: 'Ready to Raise Hand',
    WAITING: 'Waiting for Faculty Approval',
    APPROVED: 'Approved – Ready to Start Recording',
    RECORDING: 'Recording in Progress…',
    COMPLETED: 'Recording Completed',
  };

  // Render action button with project CSS classes
  const renderActionButton = () => {
    switch (uiState) {
      case UI_STATES.IDLE:
        return (
          <button className="student-btn" onClick={handleRaiseHand}>
            Raise Hand
          </button>
        );
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
      case UI_STATES.RECORDING:
        return (
          <button className="student-btn-cancel" onClick={handleStopRecording}>
            Stop Recording
          </button>
        );
      case UI_STATES.COMPLETED:
        return <span className="text-success font-semibold">Done</span>;
      default:
        return null;
    }
  };

  // Loading guard
  if (!student) {
    return <div className="loading">Loading student info…</div>;
  }

  return (
    <div className="student-card">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
        <button className="student-btn-cancel" onClick={handleLogout}>Logout</button>
      </div>
      <h2 className="student-header">{student.name}</h2>
      <p className="student-id">
        Roll / ID: {student.studentIdNumber || student.studentId || student.id}
      </p>
      <p className="balance">Token Balance: {balance}</p>
      <p className="status">Status: {STATUS_LABELS[uiState] || uiState}</p>

      {micError && (
        <div style={{ margin: '1rem 0', padding: '0.75rem', backgroundColor: '#fef2f2', color: '#dc2626', borderRadius: '6px', border: '1px solid #fca5a5', fontSize: '0.9rem' }}>
          ⚠️ {micError}
        </div>
      )}

      {(uiState === UI_STATES.APPROVED || uiState === UI_STATES.RECORDING || uiState === UI_STATES.COMPLETED) && topic && (
        <div style={{ margin: '1rem 0', padding: '0.85rem', backgroundColor: '#e0f2fe', borderRadius: '6px', borderLeft: '4px solid #0284c7', textAlign: 'left' }}>
          <h4 style={{ margin: '0 0 0.25rem 0', color: '#0369a1', fontSize: '0.95rem' }}>Participation Topic:</h4>
          <p style={{ margin: 0, fontWeight: 600, color: '#0f172a' }}>{topic}</p>
          {extraInfo && <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.85rem', color: '#334155' }}>{extraInfo}</p>}
        </div>
      )}

      <div className="action-container">
        {renderActionButton()}
        {uiState === UI_STATES.COMPLETED && (
          <button className="student-btn" onClick={handleBackToParticipation} style={{ marginLeft: '0.75rem' }}>
            Back to Participation
          </button>
        )}
      </div>

      {audioUrl && (uiState === UI_STATES.COMPLETED || uiState === UI_STATES.RECORDING) && (
        <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', textAlign: 'left' }}>
          <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#475569' }}>Audio Recording Playback:</h4>
          <audio controls src={audioUrl} style={{ width: '100%' }} />
        </div>
      )}

    </div>
  );
}
