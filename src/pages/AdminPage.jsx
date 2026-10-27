import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post, put, postFormData, del } from '../utils/api.js';
import ThemeSwitcher from '../components/ThemeSwitcher.jsx';

export default function AdminPage() {
  const navigate = useNavigate();

  // Overview data
  const [sections, setSections] = useState([]);
  const [facultyList, setFacultyList] = useState([]);
  const [totals, setTotals] = useState({ totalSections: 0, totalStudents: 0, totalFaculty: 0 });
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);

  // Active navigation tab: 'classes' | 'create-class' | 'teachers' | 'upload-csv'
  const [activeTab, setActiveTab] = useState('classes');

  // Form states: Create Class
  const [newSectionName, setNewSectionName] = useState('');
  const [newCourseTitle, setNewCourseTitle] = useState('');
  const [newCourseCode, setNewCourseCode] = useState('');
  const [newTerm, setNewTerm] = useState('Fall 2026');
  const [isCreatingSection, setIsCreatingSection] = useState(false);

  // Modal: Edit Class Section
  const [editModalSection, setEditModalSection] = useState(null);
  const [editSectionName, setEditSectionName] = useState('');
  const [editCourseTitle, setEditCourseTitle] = useState('');
  const [editCourseCode, setEditCourseCode] = useState('');
  const [editTerm, setEditTerm] = useState('Fall 2026');
  const [isSavingEditSection, setIsSavingEditSection] = useState(false);

  // Form states: Create Teacher
  const [teacherName, setTeacherName] = useState('');
  const [teacherEmail, setTeacherEmail] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [teacherSectionId, setTeacherSectionId] = useState('');
  const [isCreatingTeacher, setIsCreatingTeacher] = useState(false);
  const [createdTeacherCredentials, setCreatedTeacherCredentials] = useState(null);

  // Form states: Upload CSV
  const [csvSectionId, setCsvSectionId] = useState('');
  const [csvMode, setCsvMode] = useState('file'); // 'file' | 'text'
  const [csvText, setCsvText] = useState('');
  const [isUploadingCsv, setIsUploadingCsv] = useState(false);
  const [generatedStudentCredentials, setGeneratedStudentCredentials] = useState(null);
  const csvFileInputRef = useRef(null);

  // Modal: View Class Roster
  const [rosterModalSection, setRosterModalSection] = useState(null);
  const [rosterStudents, setRosterStudents] = useState([]);
  const [loadingRoster, setLoadingRoster] = useState(false);

  // Quick Assign Teacher to Section
  const [assignModalSection, setAssignModalSection] = useState(null);
  const [selectedFacultyIdToAssign, setSelectedFacultyIdToAssign] = useState('');
  const [isAssigningFaculty, setIsAssigningFaculty] = useState(false);

  // Load Admin Data on mount
  const loadData = async () => {
    setLoading(true);
    try {
      const [overviewData, facData] = await Promise.all([
        get('/api/admin/overview'),
        get('/api/admin/faculty').catch(() => ({ faculty: [] })),
      ]);
      if (overviewData) {
        setSections(overviewData.sections || []);
        setTotals(overviewData.totals || { totalSections: 0, totalStudents: 0, totalFaculty: 0 });
        if (overviewData.sections?.length > 0 && !csvSectionId) {
          setCsvSectionId(overviewData.sections[0].id);
        }
      }
      if (facData) {
        setFacultyList(facData.faculty || []);
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
      setFeedback({ type: 'error', message: err.message || 'Failed to load admin portal data' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showToast = (type, message) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4500);
  };

  // 1. Create New Class
  const handleCreateSection = async (e) => {
    e.preventDefault();
    if (!newSectionName.trim()) {
      showToast('error', 'Please enter a class / section name (e.g. 3Q14)');
      return;
    }
    setIsCreatingSection(true);
    try {
      const res = await post('/api/admin/sections', {
        sectionName: newSectionName.trim(),
        courseTitle: newCourseTitle.trim() || undefined,
        courseCode: newCourseCode.trim() || undefined,
        term: newTerm.trim() || undefined,
      });
      showToast('success', `Class ${res.section.sectionName} created successfully!`);
      setNewSectionName('');
      setNewCourseTitle('');
      setNewCourseCode('');
      // Refresh list
      await loadData();
      // Preselect new class for CSV upload and switch tab
      setCsvSectionId(res.section.id);
      setActiveTab('upload-csv');
    } catch (err) {
      console.error('Create class error:', err);
      showToast('error', err.message || 'Failed to create class section');
    } finally {
      setIsCreatingSection(false);
    }
  };

  // Open Edit Class Modal
  const handleOpenEditSection = (sec) => {
    setEditModalSection(sec);
    setEditSectionName(sec.sectionName || '');
    setEditCourseTitle(sec.courseTitle || '');
    setEditCourseCode(sec.courseCode || '');
    setEditTerm(sec.term || 'Fall 2026');
  };

  // Save Edited Class Details
  const handleSaveEditSection = async (e) => {
    e.preventDefault();
    if (!editModalSection || !editSectionName.trim()) {
      showToast('error', 'Class name is required');
      return;
    }
    setIsSavingEditSection(true);
    try {
      await put(`/api/admin/sections/${editModalSection.id}`, {
        sectionName: editSectionName.trim(),
        courseTitle: editCourseTitle.trim() || undefined,
        courseCode: editCourseCode.trim() || undefined,
        term: editTerm.trim() || undefined,
      });
      showToast('success', `Class ${editSectionName} updated successfully!`);
      setEditModalSection(null);
      await loadData();
    } catch (err) {
      console.error('Update section error:', err);
      showToast('error', err.message || 'Failed to update class details');
    } finally {
      setIsSavingEditSection(false);
    }
  };

  // Remove / unassign teacher from a specific class
  const handleUnassignFaculty = async (sectionId, facultyId, sectionName, facultyName) => {
    if (!window.confirm(`Remove ${facultyName || 'this teacher'} from class ${sectionName}?`)) {
      return;
    }
    try {
      await del(`/api/admin/sections/${sectionId}/faculty/${facultyId}`);
      showToast('success', `Teacher removed from class ${sectionName}`);
      await loadData();
    } catch (err) {
      console.error('Unassign faculty error:', err);
      showToast('error', err.message || 'Failed to remove teacher from class');
    }
  };

  // Delete teacher account entirely from system
  const handleDeleteFaculty = async (faculty) => {
    if (!window.confirm(`Are you sure you want to delete teacher "${faculty.name}"? This will permanently delete their account and unassign them from all classes.`)) {
      return;
    }
    try {
      await del(`/api/admin/faculty/${faculty.id}`);
      showToast('success', `Teacher "${faculty.name}" deleted successfully`);
      await loadData();
    } catch (err) {
      console.error('Delete faculty error:', err);
      showToast('error', err.message || 'Failed to delete teacher account');
    }
  };

  // 2. Create Teacher Account
  const handleCreateTeacher = async (e) => {
    e.preventDefault();
    if (!teacherName.trim() || !teacherEmail.trim()) {
      showToast('error', 'Teacher name and email are required');
      return;
    }
    setIsCreatingTeacher(true);
    setCreatedTeacherCredentials(null);
    try {
      const res = await post('/api/admin/faculty', {
        name: teacherName.trim(),
        email: teacherEmail.trim(),
        password: teacherPassword.trim() || undefined,
        sectionId: teacherSectionId || undefined,
      });
      setCreatedTeacherCredentials(res.faculty);
      showToast('success', `Teacher account for "${res.faculty.name}" created successfully!`);
      setTeacherName('');
      setTeacherEmail('');
      setTeacherPassword('');
      await loadData();
    } catch (err) {
      console.error('Create teacher error:', err);
      showToast('error', err.message || 'Failed to create teacher account');
    } finally {
      setIsCreatingTeacher(false);
    }
  };

  // 3. Assign Faculty to Section
  const handleAssignFaculty = async () => {
    if (!assignModalSection || !selectedFacultyIdToAssign) return;
    setIsAssigningFaculty(true);
    try {
      await post(`/api/admin/sections/${assignModalSection.id}/faculty`, {
        facultyId: selectedFacultyIdToAssign,
      });
      showToast('success', 'Teacher assigned to class successfully!');
      setAssignModalSection(null);
      setSelectedFacultyIdToAssign('');
      await loadData();
    } catch (err) {
      console.error('Assign teacher error:', err);
      showToast('error', err.message || 'Failed to assign teacher');
    } finally {
      setIsAssigningFaculty(false);
    }
  };

  // 4. Upload Student CSV & Generate Credentials
  const handleUploadCsv = async (e) => {
    if (e) e.preventDefault();
    if (!csvSectionId) {
      showToast('error', 'Please select a class to enroll students into');
      return;
    }

    setIsUploadingCsv(true);
    setGeneratedStudentCredentials(null);

    try {
      let res;
      if (csvMode === 'file') {
        const file = csvFileInputRef.current?.files?.[0];
        if (!file) {
          showToast('error', 'Please select a CSV or TXT file to upload');
          setIsUploadingCsv(false);
          return;
        }
        const formData = new FormData();
        formData.append('file', file);
        res = await postFormData(`/api/admin/sections/${csvSectionId}/students-csv`, formData);
      } else {
        if (!csvText.trim()) {
          showToast('error', 'Please paste student rows in the textarea');
          setIsUploadingCsv(false);
          return;
        }
        res = await post(`/api/admin/sections/${csvSectionId}/students-csv`, {
          csvText: csvText.trim(),
        });
      }

      setGeneratedStudentCredentials(res);
      showToast('success', `Successfully provisioned ${res.count} students for section ${res.section.sectionName}!`);
      setCsvText('');
      if (csvFileInputRef.current) csvFileInputRef.current.value = '';
      await loadData();
    } catch (err) {
      console.error('CSV upload error:', err);
      showToast('error', err.message || 'Failed to process student CSV');
    } finally {
      setIsUploadingCsv(false);
    }
  };

  // 5. Download Generated Credentials as CSV
  const handleDownloadCredentialsCsv = () => {
    if (!generatedStudentCredentials?.students?.length) return;
    const students = generatedStudentCredentials.students;
    const secName = generatedStudentCredentials.section?.sectionName || 'Class';

    const headers = ['Roll Number', 'Name', 'Login Email', 'Default Password', 'Class Section'];
    const rows = students.map((s) => [
      `"${s.rollNumber}"`,
      `"${s.name}"`,
      `"${s.email}"`,
      `"${s.password}"`,
      `"${secName}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `smarttoken_credentials_${secName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('success', `Downloaded credentials for ${secName}`);
  };

  // Copy credentials table to clipboard
  const handleCopyCredentials = () => {
    if (!generatedStudentCredentials?.students?.length) return;
    const text = generatedStudentCredentials.students
      .map((s) => `${s.rollNumber}\t${s.name}\t${s.email}\t${s.password}`)
      .join('\n');
    navigator.clipboard.writeText(`Roll No\tName\tEmail\tPassword\n` + text);
    showToast('success', 'Credentials copied to clipboard!');
  };

  // 6. View Class Roster Modal
  const handleOpenRoster = async (section) => {
    setRosterModalSection(section);
    setLoadingRoster(true);
    try {
      const res = await get(`/api/admin/sections/${section.id}/students`);
      setRosterStudents(res.students || []);
    } catch (err) {
      console.error('Failed to load roster:', err);
      showToast('error', 'Failed to load students for this class');
    } finally {
      setLoadingRoster(false);
    }
  };

  // 7. Delete Section
  const handleDeleteSection = async (section) => {
    if (!window.confirm(`Are you sure you want to delete class ${section.sectionName}? This will remove all enrollments and token records for this section.`)) {
      return;
    }
    try {
      await del(`/api/admin/sections/${section.id}`);
      showToast('success', `Class ${section.sectionName} deleted successfully`);
      await loadData();
    } catch (err) {
      console.error('Delete section error:', err);
      showToast('error', err.message || 'Failed to delete section');
    }
  };

  // Logout
  const handleLogout = () => {
    localStorage.removeItem('smarttoken_token');
    navigate('/login');
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-main, #f5f6fa)', color: 'var(--text-primary, #0f172a)' }}>
      {/* Top Navbar */}
      <header style={{
        height: '68px',
        backgroundColor: 'var(--bg-surface, #ffffff)',
        borderBottom: '1px solid var(--border-color, #e2e8f0)',
        padding: '0 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxShadow: 'var(--shadow-xs, 0 1px 2px rgba(0,0,0,0.03))'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.25rem',
            color: '#fff',
            boxShadow: '0 4px 10px rgba(79, 70, 229, 0.3)'
          }}>
            🪙
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                SmartToken
              </h1>
              <span style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                padding: '0.15rem 0.5rem',
                borderRadius: '9999px',
                backgroundColor: '#fee2e2',
                color: '#dc2626',
                border: '1px solid #fecaca'
              }}>
                🛡️ Admin Portal
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)' }}>
              Master Management • Classes, Faculty & Student Provisioning
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <ThemeSwitcher />
          <button
            onClick={handleLogout}
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: '8px',
              border: '1px solid var(--border-color, #cbd5e1)',
              backgroundColor: 'transparent',
              color: 'var(--text-secondary, #475569)',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'var(--transition-fast, all 0.15s ease)'
            }}
          >
            <span>🚪</span> Log Out
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: '1240px', margin: '0 auto', padding: '1.75rem 1.5rem' }}>
        {/* Feedback Alert Toast */}
        {feedback && (
          <div style={{
            marginBottom: '1.25rem',
            padding: '0.85rem 1.25rem',
            borderRadius: '10px',
            fontSize: '0.88rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: feedback.type === 'success' ? '#f0fdf4' : '#fef2f2',
            color: feedback.type === 'success' ? '#15803d' : '#b91c1c',
            border: feedback.type === 'success' ? '1px solid #bbf7d0' : '1px solid #fecaca',
            boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.05))'
          }}>
            <span>{feedback.message}</span>
            <button
              onClick={() => setFeedback(null)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1rem', color: 'inherit' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* System Stats Counters */}
        <section style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          marginBottom: '1.75rem'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-surface, #ffffff)',
            borderRadius: '14px',
            padding: '1.15rem 1.35rem',
            border: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            boxShadow: 'var(--shadow-xs, 0 1px 2px rgba(0,0,0,0.03))'
          }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              backgroundColor: '#eff6ff',
              color: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.4rem'
            }}>
              🏫
            </div>
            <div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, lineHeight: 1.1 }}>{totals.totalSections}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', fontWeight: 500 }}>Active Classes</div>
            </div>
          </div>

          <div style={{
            backgroundColor: 'var(--bg-surface, #ffffff)',
            borderRadius: '14px',
            padding: '1.15rem 1.35rem',
            border: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            boxShadow: 'var(--shadow-xs, 0 1px 2px rgba(0,0,0,0.03))'
          }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              backgroundColor: '#f5f3ff',
              color: '#7c3aed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.4rem'
            }}>
              👨‍🏫
            </div>
            <div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, lineHeight: 1.1 }}>{totals.totalFaculty}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', fontWeight: 500 }}>Faculty Members</div>
            </div>
          </div>

          <div style={{
            backgroundColor: 'var(--bg-surface, #ffffff)',
            borderRadius: '14px',
            padding: '1.15rem 1.35rem',
            border: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            boxShadow: 'var(--shadow-xs, 0 1px 2px rgba(0,0,0,0.03))'
          }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              backgroundColor: '#ecfdf5',
              color: '#059669',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.4rem'
            }}>
              🎓
            </div>
            <div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, lineHeight: 1.1 }}>{totals.totalStudents}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', fontWeight: 500 }}>Enrolled Students</div>
            </div>
          </div>
        </section>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '1px solid var(--border-color, #e2e8f0)',
          marginBottom: '1.5rem',
          overflowX: 'auto',
          paddingBottom: '0.2rem'
        }}>
          {[
            { id: 'classes', label: '🏫 Classes & Sections', count: sections.length },
            { id: 'create-class', label: '➕ Add New Class' },
            { id: 'teachers', label: '👨‍🏫 Teacher Management', count: facultyList.length },
            { id: 'upload-csv', label: '📑 Upload Student CSV' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '0.65rem 1.15rem',
                fontSize: '0.88rem',
                fontWeight: activeTab === tab.id ? 700 : 500,
                color: activeTab === tab.id ? 'var(--primary-color, #4f46e5)' : 'var(--text-secondary, #64748b)',
                backgroundColor: 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.id ? '3px solid var(--primary-color, #4f46e5)' : '3px solid transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                transition: 'all 0.15s ease'
              }}
            >
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span style={{
                  fontSize: '0.72rem',
                  padding: '0.1rem 0.45rem',
                  borderRadius: '9999px',
                  backgroundColor: activeTab === tab.id ? 'var(--primary-light, #eef2ff)' : 'var(--border-color, #e2e8f0)',
                  color: activeTab === tab.id ? 'var(--primary-color, #4f46e5)' : 'var(--text-secondary, #64748b)'
                }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: CLASSES LIST */}
        {/* ========================================================================= */}
        {activeTab === 'classes' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Class Sections</h2>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'var(--text-secondary, #64748b)' }}>
                  Active classes, enrolled rosters, and assigned faculty
                </p>
              </div>
              <button
                onClick={() => setActiveTab('create-class')}
                style={{
                  padding: '0.55rem 1rem',
                  borderRadius: '8px',
                  backgroundColor: 'var(--primary-color, #4f46e5)',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.1))'
                }}
              >
                <span>➕</span> Add New Class
              </button>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Loading classes...</div>
            ) : sections.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '3rem 1.5rem',
                backgroundColor: 'var(--bg-surface, #ffffff)',
                borderRadius: '12px',
                border: '1px solid var(--border-color, #e2e8f0)'
              }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🏫</div>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>No classes created yet</h3>
                <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0.35rem 0 1rem' }}>
                  Create your first class (e.g. 3Q13 or 3Q14) and enroll students with CSV.
                </p>
                <button
                  onClick={() => setActiveTab('create-class')}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: 'var(--primary-color, #4f46e5)',
                    color: '#fff',
                    borderRadius: '8px',
                    border: 'none',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Create Class
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.25rem' }}>
                {sections.map((sec) => (
                  <div
                    key={sec.id}
                    style={{
                      backgroundColor: 'var(--bg-surface, #ffffff)',
                      borderRadius: '14px',
                      border: '1px solid var(--border-color, #e2e8f0)',
                      padding: '1.35rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: 'var(--shadow-xs, 0 1px 2px rgba(0,0,0,0.03))'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>
                              {sec.sectionName}
                            </span>
                            <span style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '0.15rem 0.5rem',
                              borderRadius: '6px',
                              backgroundColor: 'var(--bg-subtle, #f1f5f9)',
                              color: 'var(--text-secondary, #475569)',
                              border: '1px solid var(--border-color, #e2e8f0)'
                            }}>
                              {sec.term || 'Fall 2026'}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)', marginTop: '0.2rem' }}>
                            {sec.courseTitle} <span style={{ opacity: 0.6 }}>({sec.courseCode})</span>
                          </div>
                        </div>

                        <span style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '0.2rem 0.6rem',
                          borderRadius: '9999px',
                          backgroundColor: '#ecfdf5',
                          color: '#047857',
                          border: '1px solid #a7f3d0'
                        }}>
                          {sec.studentCount} Students
                        </span>
                      </div>

                      {/* Assigned Teachers list */}
                      <div style={{
                        marginTop: '0.85rem',
                        padding: '0.65rem 0.85rem',
                        borderRadius: '8px',
                        backgroundColor: 'var(--bg-subtle, #f8fafc)',
                        border: '1px solid var(--border-color, #e2e8f0)'
                      }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary, #64748b)', marginBottom: '0.35rem' }}>
                          👨‍🏫 Assigned Faculty:
                        </div>
                        {sec.faculty?.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            {sec.faculty.map((f) => (
                              <div
                                key={f.id}
                                style={{
                                  fontSize: '0.78rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '0.35rem',
                                  padding: '0.15rem 0'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  <span style={{ fontWeight: 600 }}>{f.name}</span>
                                  <span style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.72rem' }}>({f.email})</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleUnassignFaculty(sec.id, f.id, sec.sectionName, f.name)}
                                  title={`Remove ${f.name} from class ${sec.sectionName}`}
                                  style={{
                                    border: 'none',
                                    background: '#fee2e2',
                                    color: '#dc2626',
                                    cursor: 'pointer',
                                    width: '20px',
                                    height: '20px',
                                    borderRadius: '4px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.75rem',
                                    fontWeight: 800,
                                    lineHeight: 1,
                                    padding: 0
                                  }}
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic' }}>
                            No teacher assigned yet
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions toolbar */}
                    <div style={{
                      marginTop: '1.15rem',
                      paddingTop: '0.85rem',
                      borderTop: '1px solid var(--border-color, #f1f5f9)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      flexWrap: 'wrap'
                    }}>
                      <button
                        onClick={() => handleOpenRoster(sec)}
                        style={{
                          flex: 1,
                          padding: '0.45rem 0.65rem',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          borderRadius: '6px',
                          border: '1px solid var(--border-color, #cbd5e1)',
                          backgroundColor: '#ffffff',
                          color: 'var(--text-primary, #1e293b)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.3rem'
                        }}
                      >
                        <span>👥</span> View Roster
                      </button>

                      <button
                        onClick={() => handleOpenEditSection(sec)}
                        style={{
                          padding: '0.45rem 0.65rem',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          borderRadius: '6px',
                          border: '1px solid var(--border-color, #cbd5e1)',
                          backgroundColor: '#ffffff',
                          color: 'var(--text-primary, #1e293b)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}
                        title="Edit Class Details"
                      >
                        <span>✏️</span> Edit
                      </button>

                      <button
                        onClick={() => {
                          setAssignModalSection(sec);
                          setSelectedFacultyIdToAssign('');
                        }}
                        style={{
                          padding: '0.45rem 0.65rem',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          borderRadius: '6px',
                          border: '1px solid var(--border-color, #cbd5e1)',
                          backgroundColor: '#ffffff',
                          color: 'var(--text-primary, #1e293b)',
                          cursor: 'pointer',
                        }}
                        title="Assign Teacher"
                      >
                        ➕ Teacher
                      </button>

                      <button
                        onClick={() => {
                          setCsvSectionId(sec.id);
                          setActiveTab('upload-csv');
                        }}
                        style={{
                          padding: '0.45rem 0.65rem',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          borderRadius: '6px',
                          border: '1px solid #c7d2fe',
                          backgroundColor: '#eff6ff',
                          color: '#2563eb',
                          cursor: 'pointer',
                        }}
                        title="Upload Student CSV"
                      >
                        📥 CSV
                      </button>

                      <button
                        onClick={() => handleDeleteSection(sec)}
                        style={{
                          padding: '0.45rem 0.55rem',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          borderRadius: '6px',
                          border: '1px solid #fecaca',
                          backgroundColor: '#fee2e2',
                          color: '#dc2626',
                          cursor: 'pointer',
                        }}
                        title="Delete Class"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: CREATE NEW CLASS */}
        {/* ========================================================================= */}
        {activeTab === 'create-class' && (
          <div style={{ maxWidth: '640px', margin: '0 auto' }}>
            <div style={{
              backgroundColor: 'var(--bg-surface, #ffffff)',
              borderRadius: '16px',
              border: '1px solid var(--border-color, #e2e8f0)',
              padding: '2rem',
              boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.05))'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  backgroundColor: '#eff6ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.3rem'
                }}>
                  🏫
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Add New Class Section</h2>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)' }}>
                    Create a new section like 3Q13 or 3Q14 to host students and faculty
                  </p>
                </div>
              </div>

              <form onSubmit={handleCreateSection} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Class / Section Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 3Q14"
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value)}
                    style={{
                      padding: '0.65rem 0.85rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color, #cbd5e1)',
                      fontSize: '0.9rem',
                      fontWeight: 600
                    }}
                  />
                  <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                    Used for student password formulas and classroom identification.
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.85rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Course Title</label>
                    <input
                      type="text"
                      placeholder="e.g. Database Management Systems"
                      value={newCourseTitle}
                      onChange={(e) => setNewCourseTitle(e.target.value)}
                      style={{
                        padding: '0.65rem 0.85rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color, #cbd5e1)',
                        fontSize: '0.9rem'
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Course Code</label>
                    <input
                      type="text"
                      placeholder="e.g. CS102"
                      value={newCourseCode}
                      onChange={(e) => setNewCourseCode(e.target.value)}
                      style={{
                        padding: '0.65rem 0.85rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color, #cbd5e1)',
                        fontSize: '0.9rem'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Academic Term</label>
                  <input
                    type="text"
                    placeholder="e.g. Fall 2026"
                    value={newTerm}
                    onChange={(e) => setNewTerm(e.target.value)}
                    style={{
                      padding: '0.65rem 0.85rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color, #cbd5e1)',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isCreatingSection}
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.75rem 1.25rem',
                    borderRadius: '8px',
                    backgroundColor: 'var(--primary-color, #4f46e5)',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.92rem',
                    border: 'none',
                    cursor: isCreatingSection ? 'not-allowed' : 'pointer',
                    boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.1))'
                  }}
                >
                  {isCreatingSection ? 'Creating Class...' : 'Create Class & Proceed to Students CSV'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: TEACHER MANAGEMENT */}
        {/* ========================================================================= */}
        {activeTab === 'teachers' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: '1.75rem', alignItems: 'flex-start' }}>
            {/* Create Teacher Form */}
            <div style={{
              backgroundColor: 'var(--bg-surface, #ffffff)',
              borderRadius: '16px',
              border: '1px solid var(--border-color, #e2e8f0)',
              padding: '1.75rem',
              boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.05))'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  backgroundColor: '#f5f3ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.2rem'
                }}>
                  👨‍🏫
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>Provision Teacher Login</h3>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)' }}>
                    Generate login credentials & assign to a class
                  </p>
                </div>
              </div>

              <form onSubmit={handleCreateTeacher} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Teacher Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dr. Radhika Sharma"
                    value={teacherName}
                    onChange={(e) => setTeacherName(e.target.value)}
                    style={{
                      padding: '0.55rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color, #cbd5e1)',
                      fontSize: '0.85rem'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. radhika@smarttoken.edu"
                    value={teacherEmail}
                    onChange={(e) => setTeacherEmail(e.target.value)}
                    style={{
                      padding: '0.55rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color, #cbd5e1)',
                      fontSize: '0.85rem'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Password (Optional)</label>
                  <input
                    type="text"
                    placeholder="Leave empty for auto-generated password"
                    value={teacherPassword}
                    onChange={(e) => setTeacherPassword(e.target.value)}
                    style={{
                      padding: '0.55rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color, #cbd5e1)',
                      fontSize: '0.85rem'
                    }}
                  />
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                    Defaults to <code style={{ color: '#4f46e5' }}>Faculty@&lt;FirstName&gt;</code>
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Assign to Class (Optional)</label>
                  <select
                    value={teacherSectionId}
                    onChange={(e) => setTeacherSectionId(e.target.value)}
                    style={{
                      padding: '0.55rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color, #cbd5e1)',
                      fontSize: '0.85rem',
                      backgroundColor: '#ffffff'
                    }}
                  >
                    <option value="">-- No initial assignment --</option>
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.sectionName} — {s.courseTitle}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={isCreatingTeacher}
                  style={{
                    marginTop: '0.4rem',
                    padding: '0.65rem 1rem',
                    borderRadius: '8px',
                    backgroundColor: 'var(--primary-color, #4f46e5)',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.88rem',
                    border: 'none',
                    cursor: isCreatingTeacher ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isCreatingTeacher ? 'Creating...' : 'Create Teacher Account'}
                </button>
              </form>

              {/* Created credentials callout */}
              {createdTeacherCredentials && (
                <div style={{
                  marginTop: '1.25rem',
                  padding: '0.85rem 1rem',
                  borderRadius: '10px',
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#15803d', marginBottom: '0.4rem' }}>
                    ✅ New Teacher Credentials:
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#166534', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <div><strong>Email:</strong> {createdTeacherCredentials.email}</div>
                    <div><strong>Password:</strong> <code style={{ backgroundColor: '#ffffff', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{createdTeacherCredentials.password}</code></div>
                  </div>
                </div>
              )}
            </div>

            {/* Existing Faculty List */}
            <div style={{
              backgroundColor: 'var(--bg-surface, #ffffff)',
              borderRadius: '16px',
              border: '1px solid var(--border-color, #e2e8f0)',
              padding: '1.75rem',
              boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.05))'
            }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.15rem', fontWeight: 700 }}>
                Existing Faculty Accounts ({facultyList.length})
              </h3>
              {facultyList.length === 0 ? (
                <p style={{ color: '#64748b', fontSize: '0.85rem' }}>No faculty registered yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {facultyList.map((f) => (
                    <div
                      key={f.id}
                      style={{
                        padding: '0.85rem 1rem',
                        borderRadius: '10px',
                        backgroundColor: 'var(--bg-subtle, #f8fafc)',
                        border: '1px solid var(--border-color, #e2e8f0)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{f.name}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)' }}>{f.email}</div>
                        <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                          {f.sections?.length > 0 ? (
                            f.sections.map((sec) => (
                              <span
                                key={sec.sectionId}
                                style={{
                                  fontSize: '0.7rem',
                                  padding: '0.12rem 0.45rem',
                                  borderRadius: '4px',
                                  backgroundColor: '#e0e7ff',
                                  color: '#4338ca',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem'
                                }}
                              >
                                {sec.sectionName}
                                <button
                                  type="button"
                                  onClick={() => handleUnassignFaculty(sec.sectionId, f.id, sec.sectionName, f.name)}
                                  title={`Remove ${f.name} from class ${sec.sectionName}`}
                                  style={{
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#dc2626',
                                    cursor: 'pointer',
                                    padding: 0,
                                    fontSize: '0.72rem',
                                    fontWeight: 800
                                  }}
                                >
                                  ✕
                                </button>
                              </span>
                            ))
                          ) : (
                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>No assigned sections</span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteFaculty(f)}
                        style={{
                          padding: '0.35rem 0.65rem',
                          borderRadius: '6px',
                          border: '1px solid #fecaca',
                          backgroundColor: '#fee2e2',
                          color: '#dc2626',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          whiteSpace: 'nowrap'
                        }}
                        title={`Delete account for ${f.name}`}
                      >
                        <span>🗑️</span> Remove Teacher
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: UPLOAD STUDENT CSV & CREDENTIAL GENERATOR */}
        {/* ========================================================================= */}
        {activeTab === 'upload-csv' && (
          <div style={{ maxWidth: '860px', margin: '0 auto' }}>
            <div style={{
              backgroundColor: 'var(--bg-surface, #ffffff)',
              borderRadius: '16px',
              border: '1px solid var(--border-color, #e2e8f0)',
              padding: '2rem',
              boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.05))'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '1.25rem' }}>
                <div style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '12px',
                  backgroundColor: '#ecfdf5',
                  color: '#059669',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.4rem'
                }}>
                  📑
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Student CSV Provisioning</h2>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary, #64748b)' }}>
                    Bulk enroll students and automatically generate rule-based logins & passwords
                  </p>
                </div>
              </div>

              {/* Explanatory Rule Banner */}
              <div style={{
                padding: '0.85rem 1.15rem',
                borderRadius: '10px',
                backgroundColor: 'var(--bg-subtle, #f8fafc)',
                border: '1px solid var(--border-color, #e2e8f0)',
                marginBottom: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
                fontSize: '0.82rem'
              }}>
                <div style={{ fontWeight: 700, color: 'var(--text-primary, #0f172a)' }}>
                  ⚙️ Automated Rule-Based Credential Formulas:
                </div>
                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', color: 'var(--text-secondary, #475569)' }}>
                  <div>
                    <strong>Login Email:</strong> <code style={{ backgroundColor: '#ffffff', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>&lt;clean_first_name&gt;.&lt;roll_number&gt;@smarttoken.edu</code>
                  </div>
                  <div>
                    <strong>Password:</strong> <code style={{ backgroundColor: '#ffffff', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>&lt;CleanFirstName&gt;@&lt;ClassName&gt;</code> (e.g. <code>Aarav@3Q14</code>)
                  </div>
                </div>
              </div>

              <form onSubmit={handleUploadCsv} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Target Class Selector */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                    1. Select Target Class Section *
                  </label>
                  <select
                    required
                    value={csvSectionId}
                    onChange={(e) => setCsvSectionId(e.target.value)}
                    style={{
                      padding: '0.65rem 0.85rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color, #cbd5e1)',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      backgroundColor: '#ffffff'
                    }}
                  >
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.sectionName} — {s.courseTitle} ({s.studentCount} currently enrolled)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Input Mode Toggle */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                    2. Provide Student Names & Roll Numbers
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => setCsvMode('file')}
                      style={{
                        padding: '0.45rem 1rem',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        borderRadius: '6px',
                        border: csvMode === 'file' ? '1px solid var(--primary-color, #4f46e5)' : '1px solid var(--border-color, #cbd5e1)',
                        backgroundColor: csvMode === 'file' ? 'var(--primary-light, #eef2ff)' : '#ffffff',
                        color: csvMode === 'file' ? 'var(--primary-color, #4f46e5)' : '#64748b',
                        cursor: 'pointer'
                      }}
                    >
                      📁 Upload CSV File
                    </button>
                    <button
                      type="button"
                      onClick={() => setCsvMode('text')}
                      style={{
                        padding: '0.45rem 1rem',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        borderRadius: '6px',
                        border: csvMode === 'text' ? '1px solid var(--primary-color, #4f46e5)' : '1px solid var(--border-color, #cbd5e1)',
                        backgroundColor: csvMode === 'text' ? 'var(--primary-light, #eef2ff)' : '#ffffff',
                        color: csvMode === 'text' ? 'var(--primary-color, #4f46e5)' : '#64748b',
                        cursor: 'pointer'
                      }}
                    >
                      ✍️ Paste Rows Directly
                    </button>
                  </div>

                  {csvMode === 'file' ? (
                    <div>
                      <input
                        ref={csvFileInputRef}
                        type="file"
                        accept=".csv,.txt,.tsv"
                        id="student-csv-file"
                        style={{ display: 'none' }}
                      />
                      <label
                        htmlFor="student-csv-file"
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '1.75rem',
                          borderRadius: '10px',
                          border: '2px dashed var(--border-color, #cbd5e1)',
                          backgroundColor: 'var(--bg-subtle, #f8fafc)',
                          cursor: 'pointer',
                          textAlign: 'center',
                          gap: '0.5rem'
                        }}
                      >
                        <span style={{ fontSize: '2rem' }}>📤</span>
                        <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary, #0f172a)' }}>
                          Click to select .CSV or .TXT roster file
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          Accepts columns like: <code>Name, Roll Number</code> or <code>Roll Number, Name</code>
                        </span>
                      </label>
                    </div>
                  ) : (
                    <div>
                      <textarea
                        rows={7}
                        placeholder={`Paste student lines, e.g.:\nName, Roll No\nAarav Gupta, 102404001\nBhavya Patel, 102404002\nChetan Kumar, 102404003`}
                        value={csvText}
                        onChange={(e) => setCsvText(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          borderRadius: '8px',
                          border: '1px solid var(--border-color, #cbd5e1)',
                          fontSize: '0.85rem',
                          fontFamily: 'monospace',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isUploadingCsv}
                  style={{
                    padding: '0.8rem 1.5rem',
                    borderRadius: '8px',
                    backgroundColor: '#059669',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.92rem',
                    border: 'none',
                    cursor: isUploadingCsv ? 'not-allowed' : 'pointer',
                    boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.1))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem'
                  }}
                >
                  {isUploadingCsv ? (
                    <>⏳ Provisioning Accounts & Generating Passwords...</>
                  ) : (
                    <>🚀 Generate Logins & Enroll Students</>
                  )}
                </button>
              </form>

              {/* Generated Student Credentials Table */}
              {generatedStudentCredentials && (
                <div style={{
                  marginTop: '2rem',
                  paddingTop: '1.5rem',
                  borderTop: '2px solid var(--border-color, #e2e8f0)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.2rem' }}>🎉</span>
                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
                          Provisioned {generatedStudentCredentials.count} Students in {generatedStudentCredentials.section?.sectionName}
                        </h3>
                      </div>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                        Accounts have been created and are ready to log in immediately.
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={handleCopyCredentials}
                        style={{
                          padding: '0.45rem 0.85rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color, #cbd5e1)',
                          backgroundColor: '#ffffff',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        📋 Copy List
                      </button>
                      <button
                        onClick={handleDownloadCredentialsCsv}
                        style={{
                          padding: '0.45rem 0.85rem',
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: '#2563eb',
                          color: '#ffffff',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem'
                        }}
                      >
                        <span>📥</span> Download Credentials CSV
                      </button>
                    </div>
                  </div>

                  {/* Credentials Table */}
                  <div style={{
                    maxHeight: '380px',
                    overflowY: 'auto',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #e2e8f0)'
                  }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                      <thead style={{ backgroundColor: 'var(--bg-subtle, #f8fafc)', position: 'sticky', top: 0, zIndex: 1 }}>
                        <tr>
                          <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', fontWeight: 700, borderBottom: '1px solid #e2e8f0' }}>Roll No</th>
                          <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', fontWeight: 700, borderBottom: '1px solid #e2e8f0' }}>Student Name</th>
                          <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', fontWeight: 700, borderBottom: '1px solid #e2e8f0' }}>Login Email</th>
                          <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', fontWeight: 700, borderBottom: '1px solid #e2e8f0' }}>Generated Password</th>
                        </tr>
                      </thead>
                      <tbody>
                        {generatedStudentCredentials.students?.map((s, idx) => (
                          <tr key={s.studentId || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '0.55rem 0.85rem', fontWeight: 700, fontFamily: 'monospace' }}>{s.rollNumber}</td>
                            <td style={{ padding: '0.55rem 0.85rem', fontWeight: 600 }}>{s.name}</td>
                            <td style={{ padding: '0.55rem 0.85rem', color: '#4f46e5' }}>{s.email}</td>
                            <td style={{ padding: '0.55rem 0.85rem' }}>
                              <code style={{
                                backgroundColor: '#f1f5f9',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '4px',
                                fontWeight: 700,
                                color: '#0f172a'
                              }}>
                                {s.password}
                              </code>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: VIEW ROSTER */}
        {/* ========================================================================= */}
        {rosterModalSection && (
          <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1rem'
          }}>
            <div style={{
              backgroundColor: 'var(--bg-surface, #ffffff)',
              borderRadius: '16px',
              maxWidth: '750px',
              width: '100%',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: 'var(--shadow-xl, 0 20px 25px rgba(0,0,0,0.15))',
              overflow: 'hidden'
            }}>
              <div style={{
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid var(--border-color, #e2e8f0)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                    Class {rosterModalSection.sectionName} Roster
                  </h3>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                    {rosterModalSection.courseTitle} • {rosterStudents.length} Enrolled Students
                  </p>
                </div>
                <button
                  onClick={() => setRosterModalSection(null)}
                  style={{ background: 'transparent', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#64748b' }}
                >
                  ✕
                </button>
              </div>

              <div style={{ padding: '1rem 1.5rem', overflowY: 'auto', flex: 1 }}>
                {loadingRoster ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Loading roster...</div>
                ) : rosterStudents.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                    No students enrolled yet. Use the "Upload Student CSV" tab to enroll students.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead style={{ backgroundColor: 'var(--bg-subtle, #f8fafc)', position: 'sticky', top: 0 }}>
                      <tr>
                        <th style={{ padding: '0.55rem 0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Roll No</th>
                        <th style={{ padding: '0.55rem 0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Name</th>
                        <th style={{ padding: '0.55rem 0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Email</th>
                        <th style={{ padding: '0.55rem 0.75rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Token Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rosterStudents.map((s) => (
                        <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '0.5rem 0.75rem', fontWeight: 700, fontFamily: 'monospace' }}>{s.studentIdNumber}</td>
                          <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>{s.name}</td>
                          <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-secondary, #64748b)' }}>{s.email}</td>
                          <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 700, color: s.balance > 0 ? '#15803d' : '#64748b' }}>
                            🪙 {s.balance || 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div style={{ padding: '0.85rem 1.5rem', borderTop: '1px solid var(--border-color, #e2e8f0)', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setRosterModalSection(null)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    backgroundColor: '#ffffff',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: ASSIGN TEACHER TO SECTION */}
        {/* ========================================================================= */}
        {assignModalSection && (
          <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1rem'
          }}>
            <div style={{
              backgroundColor: 'var(--bg-surface, #ffffff)',
              borderRadius: '16px',
              maxWidth: '460px',
              width: '100%',
              padding: '1.5rem',
              boxShadow: 'var(--shadow-xl, 0 20px 25px rgba(0,0,0,0.15))'
            }}>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.15rem', fontWeight: 700 }}>
                Assign Faculty to Class {assignModalSection.sectionName}
              </h3>
              <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.82rem', color: '#64748b' }}>
                Select a registered faculty member to manage this section:
              </p>

              <select
                value={selectedFacultyIdToAssign}
                onChange={(e) => setSelectedFacultyIdToAssign(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color, #cbd5e1)',
                  fontSize: '0.88rem',
                  marginBottom: '1.25rem',
                  backgroundColor: '#ffffff'
                }}
              >
                <option value="">-- Choose Faculty --</option>
                {facultyList.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.email})
                  </option>
                ))}
              </select>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setAssignModalSection(null)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAssignFaculty}
                  disabled={!selectedFacultyIdToAssign || isAssigningFaculty}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'var(--primary-color, #4f46e5)',
                    color: '#ffffff',
                    fontWeight: 700,
                    cursor: selectedFacultyIdToAssign ? 'pointer' : 'not-allowed'
                  }}
                >
                  {isAssigningFaculty ? 'Assigning...' : 'Confirm Assignment'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: EDIT CLASS DETAILS */}
        {/* ========================================================================= */}
        {editModalSection && (
          <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1rem'
          }}>
            <div style={{
              backgroundColor: 'var(--bg-surface, #ffffff)',
              borderRadius: '16px',
              maxWidth: '520px',
              width: '100%',
              padding: '1.75rem',
              boxShadow: 'var(--shadow-xl, 0 20px 25px rgba(0,0,0,0.15))'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    backgroundColor: '#eff6ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.2rem'
                  }}>
                    ✏️
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Edit Class Details</h3>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
                      Update class code, course title, or academic term
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditModalSection(null)}
                  style={{ background: 'transparent', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b' }}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveEditSection} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Class / Section Code *</label>
                  <input
                    type="text"
                    required
                    value={editSectionName}
                    onChange={(e) => setEditSectionName(e.target.value)}
                    style={{
                      padding: '0.6rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color, #cbd5e1)',
                      fontSize: '0.9rem',
                      fontWeight: 600
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Course Title</label>
                    <input
                      type="text"
                      value={editCourseTitle}
                      onChange={(e) => setEditCourseTitle(e.target.value)}
                      style={{
                        padding: '0.6rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color, #cbd5e1)',
                        fontSize: '0.88rem'
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Course Code</label>
                    <input
                      type="text"
                      value={editCourseCode}
                      onChange={(e) => setEditCourseCode(e.target.value)}
                      style={{
                        padding: '0.6rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color, #cbd5e1)',
                        fontSize: '0.88rem'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Academic Term</label>
                  <input
                    type="text"
                    value={editTerm}
                    onChange={(e) => setEditTerm(e.target.value)}
                    style={{
                      padding: '0.6rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color, #cbd5e1)',
                      fontSize: '0.88rem'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setEditModalSection(null)}
                    style={{
                      padding: '0.55rem 1rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color, #cbd5e1)',
                      backgroundColor: '#ffffff',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEditSection}
                    style={{
                      padding: '0.55rem 1.25rem',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: 'var(--primary-color, #4f46e5)',
                      color: '#ffffff',
                      fontWeight: 700,
                      cursor: isSavingEditSection ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {isSavingEditSection ? 'Saving Changes...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
