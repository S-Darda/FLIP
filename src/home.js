// src/components/HomePage.js

import React from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import './HomePage.css';
import { FaUsers, FaShieldAlt, FaRocket } from 'react-icons/fa';
import { Link } from 'react-router-dom';

const HomePage = () => {
    return (
        <div className="homepage">
           <style>
           
           </style>
        
        {/* Header Section with Navbar */}
            <Header />
           
            {/* Hero Section */}
            <section className="hero">
                <h1>Welcome to Federated Learning Infrastructure Platform (FLIP)</h1>
                <p>Secure, Distributed Machine Learning Training Without Compromising Data Privacy</p>
                <div className="cta-buttons">
                    <Link to="/signup" className="btn">Get Started</Link>
                    <Link to="/learn-more" className="btn btn-secondary">Learn More</Link>
                </div>
            </section>

            {/* Features Section */}
            <section className="features" id="features">
                <h2>Key Features</h2>
                <div className="feature-list">
                    <div className="feature">
                        <FaShieldAlt className="feature-icon" />
                        <h3>Data Privacy</h3>
                        <p>Ensure compliance with GDPR by keeping sensitive data local.</p>
                    </div>
                    <div className="feature">
                        <FaUsers className="feature-icon" />
                        <h3>Collaboration</h3>
                        <p>Work together with institutions for better insights and model performance.</p>
                    </div>
                    <div className="feature">
                        <FaRocket className="feature-icon" />
                        <h3>High-Performance Computing</h3>
                        <p>Utilize GPU resources for faster and efficient model training.</p>
                    </div>
                </div>
            </section>

            {/* How It Works Section */}
            <section className="how-it-works" id="about">
                <h2>How It Works</h2>
                <div className="process-flow">
                    <div className="step">Create a Project</div>
                    <div className="step">Submit for Approval</div>
                    <div className="step">Initiate Training</div>
                    <div className="step">Monitor Progress</div>
                    <div className="step">Receive Final Model</div>
                </div>
            </section>

            {/* Testimonials Section */}
            <section className="testimonials">
                <h2>What Our Users Say</h2>
                <div className="testimonial-list">
                    <div className="testimonial">
                        <p>"This platform has transformed the way I work. I can now manage my tasks more efficiently!"</p>
                        <p>- Alex T.</p>
                    </div>
                    <div className="testimonial">
                        <p>"A fantastic tool for anyone looking to streamline their workflow."</p>
                        <p>- Jamie L.</p>
                    </div>
                    <div className="testimonial">
                        <p>"The customer support is amazing. They really care about their users!"</p>
                        <p>- Morgan R.</p>
                    </div>
                </div>
            </section>

            {/* Footer Section */}
            <Footer />
        </div>
    );
};

export default HomePage;
