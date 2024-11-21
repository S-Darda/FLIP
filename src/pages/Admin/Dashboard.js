import React, { useState } from 'react';
import './Dashboard.css'; // Import your CSS file here
import 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css'; // Include Font Awesome if needed

const Dashboard = () => {
    const [activeDropdown, setActiveDropdown] = useState(null);

    const toggleDropdown = (index) => {
        setActiveDropdown(activeDropdown === index ? null : index);
    };

    return (
        <div className="container">
            {/* Sidebar */}
            <aside className="sidebar">
                <div className="logo">
                    <img src="https://via.placeholder.com/30" alt="logo" /> FLIP
                </div>
                <ul className="nav">
                    <li onClick={() => toggleDropdown(0)}>
                        <i className="fas fa-tachometer-alt"></i> <span>Dashboard</span>
                    </li>
                    <li onClick={() => toggleDropdown(1)}>
                        <i className="fas fa-project-diagram"></i> <span>Manage Project</span>
                        <ul className={`dropdown ${activeDropdown === 1 ? 'active' : ''}`}>
                            <li className="dropdown-item"><i className="fas fa-plus"></i> Create Project</li>
                            <li className="dropdown-item"><i className="fas fa-eye"></i> View Projects</li>
                        </ul>
                    </li>
                    <li onClick={() => toggleDropdown(2)}>
                        <i className="fas fa-users"></i> <span>User and Role</span>
                        <ul className={`dropdown ${activeDropdown === 2 ? 'active' : ''}`}>
                            <li className="dropdown-item"><i className="fas fa-user-plus"></i> Add User</li>
                            <li className="dropdown-item"><i className="fas fa-user-cog"></i> Manage Roles</li>
                        </ul>
                    </li>
                    <li onClick={() => toggleDropdown(3)}>
                        <i className="fas fa-chart-line"></i> <span>Monitoring and Logging</span>
                        <ul className={`dropdown ${activeDropdown === 3 ? 'active' : ''}`}>
                            <li className="dropdown-item"><i className="fas fa-server"></i> Server Logs</li>
                            <li className="dropdown-item"><i className="fas fa-file-alt"></i> Application Logs</li>
                        </ul>
                    </li>
                    <li onClick={() => toggleDropdown(4)}>
                        <i className="fas fa-cogs"></i> <span>Federated Training Control</span>
                        <ul className={`dropdown ${activeDropdown === 4 ? 'active' : ''}`}>
                            <li className="dropdown-item"><i className="fas fa-sliders-h"></i> Training Settings</li>
                            <li className="dropdown-item"><i className="fas fa-chart-pie"></i> Performance Metrics</li>
                        </ul>
                    </li>
                    <li><i className="fas fa-shield-alt"></i> <span>Security</span></li>
                    <li><i className="fas fa-sync"></i> <span>Real-Time Updates</span></li>
                </ul>
            </aside>

            {/* Main Content */}
            <main className="dashboard">
                {/* Replace the contents inside this main section as needed */}
                <header>
                    <div className="breadcrumb">
                        <span><i className="fas fa-home"></i> Home</span>
                        <i className="fas fa-angle-right"></i>
                        <span> Overview</span>
                    </div>
                    <div className="header-icons">
                        <input type="text" placeholder="Search..." />
                        <div className="icon"><i className="fas fa-bell"></i></div>
                        <div className="icon"><i className="fas fa-cog"></i></div>
                        <div className="user-profile">
                            <i className="fas fa-user-circle"></i>
                            <span>Admin</span>
                        </div>
                    </div>
                </header>

                <section className="stats">
                    <div className="card">
                        <h3>Sales from 1-12 Dec.</h3>
                        <canvas id="salesChart"></canvas>
                    </div>
                    <div className="card">
                        <h3>Activity Time Distribution</h3>
                        <canvas id="activityChart"></canvas>
                    </div>
                    <div className="card">
                        <h3>User Engagement</h3>
                        <canvas id="engagementChart"></canvas>
                    </div>
                    <div className="card">
                        <h3>Website Traffic</h3>
                        <canvas id="trafficChart"></canvas>
                    </div>
                </section>

                {/* Footer */}
                <footer>
                    &copy; 2024 Developer Dashboard
                </footer>
            </main>
        </div>
    );
};

export default Dashboard;
