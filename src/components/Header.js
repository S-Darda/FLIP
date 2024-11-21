// src/components/Header.js

import React from 'react';
import { Link } from 'react-router-dom';
import './HomePage.css';
import HomePage from '../home';

const Header = () => {
    return (
        <header className="header">
            <nav className="navbar">
                <div className="logo">
                <img src="logo.jpg" alt="FLIP" />
                </div>
                <div className="nav-links">
                    <a href="/">Home</a>
                    <a href="#features">Features</a>
                    <a href="#about">About Us</a>
                    <a href="#contact">Contact</a>
                </div>
                <Link to="/signin" className="login-button">Login</Link>
            </nav>
        </header>
    );
};

export default Header;
