import React, { useState } from "react";
import "./SignUp.css"; // Assuming you have your CSS in a separate file

const SignUp = () => {
  const [passwordVisible, setPasswordVisible] = useState(false);

  const togglePasswordVisibility = () => {
    setPasswordVisible(!passwordVisible);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Handle form submission logic here
    console.log("Form submitted");
  };

  return (
    <div className="container">
      {/* Left section covers entire area but stays in the background */}
      <div className="left-section"></div>

      {/* Right section on top with white background aligned to the far right */}
      <div className="right-section">
        <div className="form-container">
          <div className="form-content">
            <h2>Sign Up</h2>
            <form onSubmit={handleSubmit}>
              <div className="input-container">
                <i className="fa fa-user"></i>
                <input type="text" placeholder="Your Name" required />
              </div>
              <div className="input-container">
                <i className="fa fa-envelope"></i>
                <input type="email" placeholder="Your email" required />
              </div>

              <div className="input-container">
                <i className="fa fa-lock"></i>
                <input
                  type={passwordVisible ? "text" : "password"}
                  placeholder="Password"
                  required
                />
                <i
                  className={`fa ${passwordVisible ? "fa-eye-slash" : "fa-eye"}`}
                  onClick={togglePasswordVisibility}
                  style={{ cursor: "pointer" }}
                ></i>
              </div>

              <button type="submit" className="signin-button">
                Sign Up
              </button>
            </form>

            <div className="or">- OR -</div>

            <div className="social-login">
              <a href="#" className="google-btn">
                Google
              </a>
              <a href="#" className="facebook-btn">
                <img
                  src="https://upload.wikimedia.org/wikipedia/commons/5/51/Facebook_f_logo_%282019%29.svg"
                  alt="Facebook Logo"
                />
                Facebook
              </a>
            </div>

            <div className="signup-link">
              Already have an account? <a href="#">Sign In</a>
            </div>
          </div>
          {/* Vertical Line */}
          <div className="vertical-line"></div>
        </div>
      </div>
    </div>
  );
};

export default SignUp;
