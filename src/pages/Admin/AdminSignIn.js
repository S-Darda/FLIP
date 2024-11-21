import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './AdminSignIn.css'; // Ensure this file exists if you're using styles

// Font Awesome imports
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEnvelope, faLock, faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';

const AdminSignIn = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');

    // Dummy database for admin
    const adminDatabase = {
        email: 'admin@flip.com',
        password: 'admin123'
    };

    // useNavigate hook from react-router-dom for redirection
    const navigate = useNavigate();

    const togglePasswordVisibility = () => {
        setShowPassword(prev => !prev);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        // Check if email and password match the admin database
        if (email === adminDatabase.email && password === adminDatabase.password) {
            alert('Admin sign-in successful!');
            setError(''); // Clear any previous error messages
            navigate('/admin-dashboard'); // Redirect to Admin Dashboard
        } else {
            setError('Invalid admin credentials. Please try again.');
        }
    };

    return (
        <div className="container">
            <div className="left-section"></div>
            <div className="right-section">
                <div className="form-container">
                    <h2>Admin Sign In</h2>
                    <form onSubmit={handleSubmit}>
                        <div className="input-container">
                            {/* Email Icon */}
                            <FontAwesomeIcon icon={faEnvelope} className="icon" />
                            <input
                                type="email"
                                placeholder="Admin email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        <div className="input-container">
                            {/* Password Icon */}
                            <FontAwesomeIcon icon={faLock} className="icon" />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Admin password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                            {/* Password Toggle Icon */}
                            <FontAwesomeIcon
                                icon={showPassword ? faEyeSlash : faEye}
                                className="icon-toggle"
                                onClick={togglePasswordVisibility}
                                style={{ cursor: 'pointer' }}
                            />
                        </div>

                        {error && <div className="error-message">{error}</div>} {/* Display error message */}

                        <button type="submit" className="signin-button">Sign In</button>
                    </form>

                    <div className="forgot-password">
                        <a href="#">Forgot password?</a>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminSignIn;
