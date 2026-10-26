import pool from '../server/db.js';

const SECTION_ID = '043f0728-c357-4e72-b6ce-62823cc064b7';

// Generate dummy base64 webm audio (valid RIFF/WebM header or small webm chunk)
const DUMMY_AUDIO_BASE64 = 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAHTEU2bdLmaZsOEd2VibUKHgQRChYECGFOAZwEAAAAAAAE1EZu4Ac4BAAAAAAACTZqBAUKHhU1lZHlhAAAAAA==';

async function run() {
  console.log('--- STARTING DIRECT PARTICIPATION & RECORD-FROM-HERE INTEGRATION TEST ---');

  // 1. Log in faculty
  const facultyLoginRes = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'faculty@example.com', password: 'FacultyPass123!' })
  });
  const facultyLogin = await facultyLoginRes.json();
  if (!facultyLogin.token) throw new Error('Faculty login failed: ' + JSON.stringify(facultyLogin));
  const facultyToken = facultyLogin.token;
  console.log('✅ Faculty authenticated');

  // 2. Log in student
  const studentLoginRes = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'student@example.com', password: 'StudentPass123!' })
  });
  const studentLogin = await studentLoginRes.json();
  if (!studentLogin.token) throw new Error('Student login failed: ' + JSON.stringify(studentLogin));
  const studentToken = studentLogin.token;
  console.log('✅ Student authenticated');

  // 3. Faculty sets discussion topic & prompt
  const topicPutRes = await fetch(`http://localhost:3001/api/sections/${SECTION_ID}/participation/topic`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${facultyToken}`
    },
    body: JSON.stringify({
      topic: 'Test Topic: Distributed Consensus',
      extraInfo: 'Discuss Paxos vs Raft leader election mechanisms.'
    })
  });
  const topicPut = await topicPutRes.json();
  console.log('✅ Topic set by faculty:', topicPut);

  // 4. Student gets topic
  const topicGetRes = await fetch(`http://localhost:3001/api/sections/${SECTION_ID}/participation/topic`, {
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  const topicGet = await topicGetRes.json();
  if (topicGet.topic !== 'Test Topic: Distributed Consensus') {
    throw new Error('Topic mismatch for student: ' + JSON.stringify(topicGet));
  }
  console.log('✅ Topic verified from student perspective:', topicGet);

  // 5. Student directly starts recording (no hand raise needed!)
  const studentRecRes = await fetch(`http://localhost:3001/api/sections/${SECTION_ID}/participation/recordings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${studentToken}`
    },
    body: JSON.stringify({})
  });
  const studentRec = await studentRecRes.json();
  if (studentRecRes.status !== 201 || !studentRec.session?.id) {
    throw new Error('Direct student recording start failed: ' + JSON.stringify(studentRec));
  }
  const studentSessionId = studentRec.session.id;
  console.log('✅ Student direct recording session created:', studentSessionId, 'status:', studentRec.session.status);

  // 6. Student completes recording with audio
  const studentCompRes = await fetch(`http://localhost:3001/api/sections/${SECTION_ID}/participation/recordings/${studentSessionId}/complete`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${studentToken}`
    },
    body: JSON.stringify({ audioBase64: DUMMY_AUDIO_BASE64 })
  });
  const studentComp = await studentCompRes.json();
  if (studentCompRes.status !== 200 || studentComp.session?.status !== 'COMPLETED') {
    throw new Error('Student recording completion failed: ' + JSON.stringify(studentComp));
  }
  console.log('✅ Student recording completed, audioUrl:', studentComp.session.audioUrl);

  // 7. Faculty uses "Record from Here" for student 'Piyush'
  const piyushLookup = await pool.query(`SELECT id FROM students WHERE name ILIKE '%Piyush%' LIMIT 1`);
  const piyushId = piyushLookup.rows[0].id;

  const facultyRecRes = await fetch(`http://localhost:3001/api/sections/${SECTION_ID}/participation/recordings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${facultyToken}`
    },
    body: JSON.stringify({
      studentId: piyushId,
      topic: 'Test Topic: Distributed Consensus',
      extraInfo: 'Piyush explaining Paxos vs Raft in person'
    })
  });
  const facultyRec = await facultyRecRes.json();
  if (facultyRecRes.status !== 201 || !facultyRec.session?.id) {
    throw new Error('Faculty "Record from Here" start failed: ' + JSON.stringify(facultyRec));
  }
  const facultySessionId = facultyRec.session.id;
  console.log('✅ Faculty "Record from Here" session created for student:', facultySessionId);

  // 8. Faculty completes recording
  const facultyCompRes = await fetch(`http://localhost:3001/api/sections/${SECTION_ID}/participation/recordings/${facultySessionId}/complete`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${facultyToken}`
    },
    body: JSON.stringify({ audioBase64: DUMMY_AUDIO_BASE64 })
  });
  const facultyComp = await facultyCompRes.json();
  if (facultyCompRes.status !== 200 || facultyComp.session?.status !== 'COMPLETED') {
    throw new Error('Faculty recording completion failed: ' + JSON.stringify(facultyComp));
  }
  console.log('✅ Faculty recording completed, audioUrl:', facultyComp.session.audioUrl);

  // 9. Verify both sessions appear on Review page endpoint
  const reviewListRes = await fetch(`http://localhost:3001/api/sections/${SECTION_ID}/participation/recordings`, {
    headers: { 'Authorization': `Bearer ${facultyToken}` }
  });
  const reviewList = await reviewListRes.json();
  const recordings = reviewList.recordings || [];
  const foundStudentSession = recordings.find(r => r.id === studentSessionId);
  const foundFacultySession = recordings.find(r => r.id === facultySessionId);

  if (!foundStudentSession) throw new Error('Student session missing from Review endpoint');
  if (!foundFacultySession) throw new Error('Faculty session missing from Review endpoint');

  console.log('✅ Both direct student recording and faculty in-class recording appear in Review list!');
  console.log('   - Student session in review:', foundStudentSession.id, foundStudentSession.studentName, foundStudentSession.status);
  console.log('   - Faculty session in review:', foundFacultySession.id, foundFacultySession.studentName, foundFacultySession.status);

  // Clean up the 2 test sessions so database stays clean
  await pool.query(`DELETE FROM recording_evaluations WHERE recording_session_id IN ($1, $2)`, [studentSessionId, facultySessionId]);
  await pool.query(`DELETE FROM recording_sessions WHERE id IN ($1, $2)`, [studentSessionId, facultySessionId]);
  console.log('✅ Cleaned up test sessions.');

  await pool.end();
  console.log('--- ALL PARTICIPATION FLOW TESTS PASSED! ---');
}

run().catch((e) => {
  console.error('❌ TEST FAILED:', e);
  process.exit(1);
});
