import React from 'react';
import './HeaderNavbar.css'; // Separate CSS for styling the navbar
import '@fortawesome/fontawesome-free/css/all.min.css';

const HeaderNavbar = () => {
    return (
        <header className="navbar">
            <div className="navbar-left">
                <h1 className="navbar-title">Dashboard</h1>
            </div>
            <div className="navbar-center">
                <input
                    type="text"
                    className="navbar-search"
                    placeholder="Search..."
                />
                <i className="fas fa-search search-icon"></i>
            </div>
            <div className="navbar-right">
                <i className="fas fa-bell navbar-icon"></i>
                <i className="fas fa-envelope navbar-icon"></i>
                <div className="profile-dropdown">
                    <img
                        src="https://via.placeholder.com/30"
                        alt="User"
                        className="profile-pic"
                    />
                    <span className="profile-name">Admin</span>
                    <i className="fas fa-caret-down"></i>
                    <ul className="dropdown-menu">
                        <li>Profile</li>
                        <li>Settings</li>
                        <li>Logout</li>
                    </ul>
                </div>
            </div>
        </header>
    );
};

export default HeaderNavbar;
