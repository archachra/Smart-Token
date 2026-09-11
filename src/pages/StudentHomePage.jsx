import React, { useState, useEffect, useRef } from 'react';
import { get, post, patch, del } from '../utils/api.js';

// Hard‑coded demo IDs – replace with real auth values later
const SECTION_ID = '043f0728-c357-4e72-b6ce-62823cc064b7';
const STUDENT_ID = '68bf0413-6cf3-41ef-8bb7-613fbaa49198';

const UI_STATES = {
  IDLE: 'IDLE',
  WAITING: 'WAITING',
  APPROVED: 'APPROVED',
  RECORDING: 'RECORDING',
  COMPLETED: 'COMPLETED',
};

export default function StudentHomePage() {
  const [student, setStudent] = useState(null);
  const [balance, setBalance] = useState(0);
  const [uiState, setUiState] = useState(UI_STATES.IDLE);
  const [raisedHandId, setRaisedHandId] = useState(null);
  const [recordingId, setRecordingId] = useState(null);
  const pollTimer = useRef(null);

  // Load student roster on mount and pick our demo student
  useEffect(() => {
    async function loadRoster() {
      try {
        const data = await get(`/api/sections/${SECTION_ID}/students`);
        // API returns { sectionId, students: [] }
        const roster = data.students || [];
        const me = roster.find((s) => s.id === STUDENT_ID);
        if (me) {
          setStudent(me);
          setBalance(me.balance);
        }
      } catch (e) {
        console.error('Failed to load roster', e);
      }
    }
    loadRoster();
  }, []);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  const startPolling = () => {
    pollTimer.current = setInterval(async () => {
      try {
        const resp = await get(
          `/api/sections/${SECTION_ID}/students/${STUDENT_ID}/participation/recording`
        );
        if (resp.session) {
          const { id, status } = resp.session;
          setRecordingId(id);
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
    }, 2500);
  };

  const handleRaiseHand = async () => {
    try {
      const resp = await post(
        `/api/sections/${SECTION_ID}/participation/raise`,
        { studentId: STUDENT_ID }
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
    try {
      await patch(
        `/api/sections/${SECTION_ID}/participation/recordings/${recordingId}/start`
      );
      setUiState(UI_STATES.RECORDING);
    } catch (e) {
      console.error('Start recording error', e);
    }
  };

  const handleStopRecording = async () => {
    if (!recordingId) return;
    try {
      await patch(
        `/api/sections/${SECTION_ID}/participation/recordings/${recordingId}/complete`
      );
      setUiState(UI_STATES.COMPLETED);
    } catch (e) {
      console.error('Stop recording error', e);
    }
  };

  // Duplicate Tailwind renderActionButton removed – using project CSS version

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
        return <span className="text-success">Done</span>;
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
      <h2 className="student-header">{student.name}</h2>
      <p className="student-id">
        Roll / ID: {student.studentIdNumber || student.studentId || student.id}
      </p>
      <p className="balance">Token Balance: {balance}</p>
      <p className="status">Status: {STATUS_LABELS[uiState] || uiState}</p>
      <div className="action-container">{renderActionButton()}</div>
    </div>
  );
}
