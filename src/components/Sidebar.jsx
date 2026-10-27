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
  const user = getCurrentUser();

  useEffect(() => {
    const loadAssignments = async () => {
      try {
        const data = await get(`/api/sections/${SECTION_ID}/assignments`);
        setAssignments(data.assignments || []);
      } catch (e) {
        // fail silently for sidebar
      }
    };

    loadAssignments();

    const handleAssignmentCreated = () => {
      loadAssignments();
    };

    window.addEventListener('assignment-created', handleAssignmentCreated);
    return () => {
      window.removeEventListener('assignment-created', handleAssignmentCreated);
    };
  }, []);

  const handleLogout = () => {
    if (user?.userId) {
      clearUserCache(user.userId);
    }
    localStorage.removeItem('smarttoken_token');
    navigate('/login');
  };

  const displayName = user?.name || (user?.email ? user.email.split('@')[0] : 'Instructor');
  const displayRole = user?.role === 'FACULTY' ? 'Lead Faculty' : (user?.role || 'Instructor');
  const userInitials = displayName
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

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
        <div className="sidebar-user-avatar">
          {userInitials || 'FC'}
        </div>
        <div className="sidebar-user-info">
          <span className="sidebar-user-name">{displayName}</span>
          <span className="sidebar-user-role">{displayRole} • 3Q13</span>
        </div>
        <button
          className="sidebar-logout-icon-btn"
          onClick={handleLogout}
          title="Sign out of SmartToken"
        >
          🚪
        </button>
      </div>
    </aside>
  );
}
