import { NavLink, useNavigate } from 'react-router-dom';

const navItems = [
  { path: '/', label: 'Home', icon: '🏠' },
  { path: '/attendance', label: 'Attendance', icon: '📋' },
  { path: '/participation', label: 'Participation', icon: '🙋‍♂️' },
  { path: '/assignments', label: 'Assignments', icon: '📝' },
  { path: '/quick-token', label: 'Quick Token', icon: '⚡' },
  { path: '/history', label: 'History', icon: '📜' },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const handleLogout = () => {
    localStorage.removeItem('smarttoken_token');
    navigate('/login');
  };

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `nav-link ${isActive ? 'active' : ''}`
            }
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
        <button className="nav-link logout-button" onClick={handleLogout}>Logout</button>
      </nav>
    </aside>
  );
}
