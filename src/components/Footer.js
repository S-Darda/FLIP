// src/components/Footer.js

import React from 'react';
import './HomePage.css';


const Footer = () => {
    return (
        <footer className="footer">
            <div className="footer-content">
                <h3>Stay Connected</h3>
                <div className="footer-links">
                    <a href="#privacy">Privacy Policy</a>
                    <a href="#terms">Terms of Service</a>
                    <a href="#about">About Us</a>
                    <a href="#contact">Contact Us</a>
                </div>
            </div>
            <div className="social-icons">
                <a href="https://facebook.com" target="_blank" rel="noopener noreferrer">
                    <i className="fab fa-facebook-f"></i>
                </a>
                <a href="https://twitter.com" target="_blank" rel="noopener noreferrer">
                    <i className="fab fa-twitter"></i>
                </a>
                <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer">
                    <i className="fab fa-linkedin-in"></i>
                </a>
            </div>
            <p>© 2024 FLIP. All rights reserved.</p>
        </footer>
    );
};

export default Footer;
