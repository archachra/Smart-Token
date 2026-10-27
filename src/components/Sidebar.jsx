import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { get } from '../utils/api.js';
import { getCurrentUser } from '../utils/syncManager.js';
import { clearUserCache } from '../utils/offlineDb.js';

const SECTION_ID = '043f0728-c357-4e72-b6ce-62823cc064b7';

const navGroups = [
  {
    group: 'CLASSROOM',
    items: [
      { path: '/', label: 'Overview', icon: '📊' },
      { path: '/quick-token', label: 'Quick Token', icon: '⚡' },
      { path: '/attendance', label: 'Attendance', icon: '📋' },
      { path: '/participation', label: 'Participation', icon: '🎙️' },
    ],
  },
  {
    group: 'EVALUATION & REVIEW',
    items: [
      { path: '/review', label: 'Review', icon: '🔍' },
      { path: '/assignments', label: 'Assignments', icon: '📝' },
    ],
  },
  {
    group: 'AUDIT',
    items: [
      { path: '/history', label: 'History', icon: '📜' },
    ],
  },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState([]);
  const [profile, setProfile] = useState(() => getCurrentUser());
  const [assignedTeacher, setAssignedTeacher] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const loadAssignments = async () => {
      try {
        const data = await get(`/api/sections/${SECTION_ID}/assignments`);
        if (isMounted) setAssignments(data.assignments || []);
      } catch (e) {
        // fail silently for sidebar
      }
    };

    const loadUserProfile = async () => {
      try {
        const data = await get('/api/auth/me');
        if (isMounted && data?.user) {
          setProfile(prev => ({ ...prev, ...data.user }));
        }
      } catch (e) {
        // Fallback to token decoded data
      }
    };

    const loadSectionFaculty = async () => {
      try {
        const data = await get(`/api/sections/${SECTION_ID}/faculty`);
        if (isMounted && data?.faculty && data.faculty.length > 0) {
          setAssignedTeacher(data.faculty[0]);
        }
      } catch (e) {
        // Fallback
      }
    };

    loadAssignments();
    loadUserProfile();
    loadSectionFaculty();

    const handleAssignmentCreated = () => {
      loadAssignments();
    };

    window.addEventListener('assignment-created', handleAssignmentCreated);
    return () => {
      isMounted = false;
      window.removeEventListener('assignment-created', handleAssignmentCreated);
    };
  }, []);

  const handleLogout = () => {
    if (profile?.userId || profile?.id) {
      clearUserCache(profile.userId || profile.id);
    }
    localStorage.removeItem('smarttoken_token');
    navigate('/login');
  };

  // Determine displayed teacher name:
  // Strictly avoid "Faculty User" or generic placeholders; prefer the teacher assigned to this section
  let displayName = '';
  if (profile?.name && !profile.name.toLowerCase().includes('faculty user') && profile.name.toLowerCase() !== 'faculty') {
    displayName = profile.name;
  } else if (assignedTeacher?.name) {
    displayName = assignedTeacher.name;
  } else {
    displayName = 'Mr Sukhpal Singh';
  }

  const displayRole = profile?.role === 'FACULTY' ? 'Lead Faculty' : (profile?.role || 'Lead Faculty');
  const sectionLabel = profile?.sectionName || assignedTeacher?.section_name || '3Q13';

  // Compute clean initials, ignoring titles like Prof., Dr., Mr.
  const cleanName = displayName.replace(/^(Prof\.?|Dr\.?|Mr\.?|Ms\.?|Mrs\.?)\s+/i, '').trim();
  const parts = cleanName.split(/\s+/).filter(Boolean);
  const userInitials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : (cleanName.slice(0, 2).toUpperCase() || 'SS');

  return (
    <aside className="sidebar">
      <div className="sidebar-scrollable">
        <nav className="sidebar-nav">
          {navGroups.map((group) => (
            <div key={group.group} className="nav-group-section">
              <span className="nav-group-title">{group.group}</span>
              <div className="nav-group-items">
                {group.items.map((item) => (
                  <div key={item.path}>
                    <NavLink
                      to={item.path}
                      end={item.path === '/'}
                      className={({ isActive }) =>
                        `nav-link ${isActive ? 'active' : ''}`
                      }
                    >
                      <span className="nav-icon">{item.icon}</span>
                      <span className="nav-label">{item.label}</span>
                    </NavLink>

                    {/* Nested assignment items under Assignments */}
                    {item.path === '/assignments' && assignments.length > 0 && (
                      <div className="sidebar-nested-container">
                        {assignments.map((assign) => (
                          <NavLink
                            key={assign.id}
                            to={`/assignments/${assign.id}`}
                            className={({ isActive }) =>
                              `nested-nav-link ${isActive ? 'active' : ''}`
                            }
                            title={assign.title}
                          >
                            <span className="nested-bullet">↳</span>
                            <span className="nested-label">
                              {assign.title}
                            </span>
                          </NavLink>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* Modern User Profile & Quick Logout at bottom */}
      <div className="sidebar-profile-card">
        <div className="sidebar-profile-header">
          <div className="sidebar-user-avatar">
            {userInitials || 'SS'}
          </div>
          <div className="sidebar-user-info">
            <span className="sidebar-user-name" title={displayName}>{displayName}</span>
            <span className="sidebar-user-role">{displayRole} • {sectionLabel}</span>
          </div>
        </div>
        <button
          className="sidebar-logout-btn"
          onClick={handleLogout}
          title="Sign out of SmartToken"
        >
          <span className="sidebar-logout-icon">🚪</span>
          <span className="sidebar-logout-text">Log Out</span>
        </button>
      </div>
    </aside>
  );
}
