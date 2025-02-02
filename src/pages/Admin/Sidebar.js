import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './Sidebar.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

const Sidebar = () => {
    const [activeDropdown, setActiveDropdown] = useState(null); // State to track active dropdown

    // Toggle dropdown visibility
    const toggleDropdown = (index) => {
        setActiveDropdown(activeDropdown === index ? null : index); // Close if already open
    };

    return (
        <aside className="sidebar">
            <div className="logo">
                <img src="logo.jpg" alt="logo" />
            </div>
            <ul className="nav">
                {/* Dashboard Link */}
                <li>
                    <Link to="/admin-dashboard">
                        <i className="fas fa-tachometer-alt"></i> <span>Dashboard</span>
                    </Link>
                </li>

                {/* Manage Project Dropdown */}
                <li onClick={() => toggleDropdown(1)} className={activeDropdown === 1 ? 'active' : ''}>
                    <i className="fas fa-project-diagram"></i> <span>Manage Project</span>
                    <ul className={`dropdown ${activeDropdown === 1 ? 'active' : ''}`}>
                        <li className="dropdown-item">
                            <Link to="/admin-manageProject">
                                <i className="fas fa-plus"></i> Manage Projects
                            </Link>
                        </li>
                    </ul>
                </li>

                {/* User and Role Dropdown */}
                <li onClick={() => toggleDropdown(2)} className={activeDropdown === 2 ? 'active' : ''}>
                    <i className="fas fa-users"></i> <span>User and Role</span>
                    <ul className={`dropdown ${activeDropdown === 2 ? 'active' : ''}`}>
                        <li className="dropdown-item">
                            <Link to="/admin-UserAndRole">
                                <i className="fas fa-user-cog"></i> Manage Users and Roles
                            </Link>
                        </li>
                    </ul>
                </li>

                {/* Other Links */}
                <li>
                    <Link to="/admin-MonitorAndLogging">
                        <i className="fas fa-chart-line"></i> <span>Monitoring and Logging</span>
                    </Link>
                </li>
                <li>
                    <Link to="/admin-FederatedTrainingControl">
                        <i className="fas fa-cogs"></i> <span>Federated Training Control</span>
                    </Link>
                </li>
                <li>
                    <Link to="/admin-SecurityPage">
                        <i className="fas fa-shield-alt"></i> <span>Security</span>
                    </Link>
                </li>
                <li>
                    <Link to="/admin-RealTimeUpdatesPage">
                        <i className="fas fa-sync"></i> <span>Real-Time Updates</span>
                    </Link>
                </li>
            </ul>
        </aside>
    );
};

export default Sidebar;
