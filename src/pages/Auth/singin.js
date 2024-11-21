import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './SignIn.css'; // Ensure this file exists if you're using styles

// Font Awesome imports
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEnvelope, faLock, faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import { faGoogle, faFacebook } from '@fortawesome/free-brands-svg-icons';
const SignIn = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    
    // Dummy database
    const dummyDatabase = {
        email: 'user@flip.com',
        password: 'flip123'
    };

    // useNavigate hook from react-router-dom for redirection
    const navigate = useNavigate();

    const togglePasswordVisibility = () => {
        setShowPassword(prev => !prev);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        // Check if email and password match the dummy database
        if (email === dummyDatabase.email && password === dummyDatabase.password) {
            alert('Sign in successful!');
            setError(''); // Clear any previous error messages
            navigate('/model-developer'); // Redirect to User Dashboard
        } else {
            setError('Invalid email or password. Please try again.');
        }
    };

    return (
        <div className="container">
            <div className="left-section"></div>
            <div className="right-section">
                <div className="form-container">
                    <h2>Sign In</h2>
                    <form onSubmit={handleSubmit}>
                        <div className="input-container">
                            {/* Email Icon */}
                            <FontAwesomeIcon icon={faEnvelope} className="icon" />
                            <input
                                type="email"
                                placeholder="Your email"
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
                                placeholder="Password"
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

                    <div className="or">- OR -</div>

                    <div className="social-login">
    {/* Google Button */}
    <button className="google-btn">
        <FontAwesomeIcon icon={faGoogle} className="social-icon" />
        Sign in with Google
    </button>

    {/* Facebook Button */}
    <button className="facebook-btn">
        <FontAwesomeIcon icon={faFacebook} className="social-icon" />
        Sign in with Facebook
    </button>
</div>

                    <div className="signup-link">
                        Don’t have an account? <a href="#">Sign Up</a>
                    </div>
                    <div className="forgot-password">
                        <a href="#">Forgot password?</a>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SignIn;
