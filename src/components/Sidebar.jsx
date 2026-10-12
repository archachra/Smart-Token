import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { get } from '../utils/api.js';

const SECTION_ID = '043f0728-c357-4e72-b6ce-62823cc064b7';

const navItems = [
  { path: '/', label: 'Home', icon: '🏠' },
  { path: '/attendance', label: 'Attendance', icon: '📋' },
  { path: '/participation', label: 'Participation', icon: '🙋‍♂️' },
  { path: '/review', label: 'Review', icon: '🔍' },
  { path: '/assignments', label: 'Assignments', icon: '📝' },
  { path: '/quick-token', label: 'Quick Token', icon: '⚡' },
  { path: '/history', label: 'History', icon: '📜' },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState([]);

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
    localStorage.removeItem('smarttoken_token');
    navigate('/login');
  };

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {navItems.map((item) => (
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
                    <span>•</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {assign.title}
                    </span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ))}
        <button className="nav-link logout-button" onClick={handleLogout}>Logout</button>
      </nav>
    </aside>
  );
}
