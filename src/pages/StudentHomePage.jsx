import React, { useState, useEffect, useRef } from 'react';
import { get, post, patch, del } from '../utils/api.js';

// Hard‑coded demo IDs – replace with real auth values later
const SECTION_ID = '00000000-0000-0000-0000-000000000001';
const STUDENT_ID = '11111111-1111-1111-1111-111111111111';

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
        const me = data.find((s) => s.id === STUDENT_ID);
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
      setRaisedHandId(resp.id);
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

  const renderActionButton = () => {
    switch (uiState) {
      case UI_STATES.IDLE:
        return (
          <button
            className="bg-primary text-white px-4 py-2 rounded-md"
            onClick={handleRaiseHand}
          >
            Raise Hand
          </button>
        );
      case UI_STATES.WAITING:
        return (
          <button
            className="bg-gray-400 text-white px-4 py-2 rounded-md"
            onClick={handleCancel}
          >
            Cancel Hand
          </button>
        );
      case UI_STATES.APPROVED:
        return (
          <button
            className="bg-primary text-white px-4 py-2 rounded-md"
            onClick={handleStartRecording}
          >
            Start Recording
          </button>
        );
      case UI_STATES.RECORDING:
        return (
          <button
            className="bg-red-600 text-white px-4 py-2 rounded-md"
            onClick={handleStopRecording}
          >
            Stop Recording
          </button>
        );
      case UI_STATES.COMPLETED:
        return <span className="text-green-600 font-medium">Done</span>;
      default:
        return null;
    }
  };

  if (!student) {
    return <div className="p-4">Loading student info…</div>;
  }

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h2 className="text-2xl font-bold mb-2">{student.name}</h2>
      <p className="mb-2">Roll / ID: {student.studentId || student.id}</p>
      <p className="mb-4">Token Balance: {balance}</p>
      <p className="mb-4 font-medium">Status: {uiState}</p>
      <div>{renderActionButton()}</div>
    </div>
  );
}
