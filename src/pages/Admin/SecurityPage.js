import React, { useState } from "react";
import { FaKey, FaShieldAlt, FaLock, FaUserShield, FaEye, FaEyeSlash } from "react-icons/fa";
import Sidebar from "./Sidebar";
import HeaderNavbar from "./HeaderNavbar";
import Footer from "./Footer";
import "./SecurityPage.css";

const SecurityPage = () => {
  const [passwordVisible, setPasswordVisible] = useState(false);

  const togglePasswordVisibility = () => {
    setPasswordVisible((prev) => !prev);
  };

  return (
    <div className="security-page-container">
      <Sidebar />
      <HeaderNavbar />

      <div className="security-header">
        <h1>🔒 Security Settings</h1>
        <p>Manage your account security and privacy settings.</p>
      </div>

      <div className="security-sections">
        {/* Password Management Section */}
        <div className="security-card password-card">
          <FaKey className="security-icon" />
          <h2>Password Management</h2>
          <p>Change your account password regularly to enhance security.</p>
          <div className="password-management">
            <input
              type={passwordVisible ? "text" : "password"}
              placeholder="Enter new password"
              className="password-input"
            />
            <button className="toggle-password" onClick={togglePasswordVisibility}>
              {passwordVisible ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>
          <button className="save-button">Update Password</button>
        </div>

        {/* Role-Based Access Control */}
        <div className="security-card access-card">
          <FaUserShield className="security-icon" />
          <h2>Role-Based Access</h2>
          <p>Assign roles and manage permissions for team members.</p>
          <button className="manage-button">Manage Roles</button>
        </div>

        {/* Account Activity Logs */}
        <div className="security-card activity-card">
          <FaShieldAlt className="security-icon" />
          <h2>Account Activity Logs</h2>
          <p>Monitor recent logins and security events.</p>
          <button className="view-button">View Logs</button>
        </div>

        {/* Security Tips Section */}
        <div className="security-card tips-card">
          <FaLock className="security-icon" />
          <h2>Security Tips</h2>
          <ul className="security-tips">
            <li>✅ Use strong, unique passwords.</li>
            <li>✅ Enable two-factor authentication (2FA).</li>
            <li>✅ Monitor your login history for unusual activity.</li>
            <li>✅ Keep your software and devices up to date.</li>
          </ul>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default SecurityPage;
