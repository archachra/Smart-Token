import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post, patch, del } from '../utils/api.js';
import AudioPlayer from '../components/AudioPlayer.jsx';

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
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [micError, setMicError] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const [transcriptionStatus, setTranscriptionStatus] = useState(null);
  const [transcriptionError, setTranscriptionError] = useState(null);
  const [evaluation, setEvaluation] = useState(null);

  const pollTimerRef = useRef(null);
  const activePollSessionRef = useRef({ pollType: null, targetId: null });
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
        }
      } catch (e) {
        console.error('Failed to load roster', e);
      }
    }
    loadRoster();
  }, []);

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

  // Poll for faculty approval tied strictly to targetRaisedHandId (Requirement B & E)
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
          // Requirement C: Approval arrived - clear stale recording state, show recording action only
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

  // Requirement B: When student clicks Raise Hand, immediately clear/hide current recording UI
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

  // Requirement C: Start recording
  const handleStartRecording = async () => {
    if (!recordingId) return;
    setMicError(null);

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
      recordStartTimeRef.current = Date.now();

      await patch(`/api/sections/${SECTION_ID}/participation/recordings/${recordingId}/start`);
      setUiState(UI_STATES.RECORDING);
    } catch (err) {
      console.error('Microphone permission or start error:', err);
      setMicError('Microphone access denied. Please grant microphone permissions to record your response.');
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
    IDLE: 'Ready to Raise Hand',
    WAITING: 'Waiting for Faculty Approval',
    APPROVED: 'Approved – Ready to Start Recording',
    RECORDING: 'Recording in Progress…',
    COMPLETED: 'Recording Completed',
  };

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

    </div>
  );
}
