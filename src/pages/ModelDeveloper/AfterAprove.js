import React, { useState } from "react";
import "./AfterAprove.css";
import Header from "../../components/Header";
import Footer from "../../components/Footer";

function AfterAprove() {
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSubmit = () => {
    // Simulate form submission and show the success message
    setShowSuccess(true);

    // Hide the success message after 3 seconds
    setTimeout(() => {
      setShowSuccess(false);
    }, 3000);
  };

  return (
    <div className="full">
      <Header />

      <div className="main-container">
        {/* Left Section: Form */}
        <div className="form-section">
          <h1 id="project-view">View Your Project</h1>

          <label htmlFor="project-number">Project Number</label>
          <input
            type="text"
            id="project-number"
            name="project-number"
            className="text-input"
            value="12345"
            readOnly
          />

          <label htmlFor="project-name">Project Name</label>
          <input
            type="text"
            id="project-name"
            name="project-name"
            className="text-input"
            value="Federated Learning Infrastructure Platform (FLIP)"
            readOnly
          />

          <label htmlFor="project-details">Project Details</label>
          <input
            type="text"
            id="project-details"
            name="project-details"
            className="text-input"
            value="A platform for secure distributed model training."
            readOnly
          />

          <label htmlFor="dataset-upload">Upload Dataset (CSV)</label>
          <input
            type="file"
            id="dataset-upload"
            name="dataset-upload"
            className="file-input"
            accept=".csv"
          />

          <label htmlFor="model-name">
            Select Your Models (Hold Ctrl to select multiple)
          </label>
          <select
            id="model-name"
            name="model-name"
            className="multi-select"
            multiple
            aria-label="Model selection"
          >
            <option value="Model A">Model A</option>
            <option value="Model B">Model B</option>
            <option value="Model C">Model C</option>
            <option value="Model D">Model D</option>
            <option value="Model E">Model E</option>
          </select>

          <button type="submit" onClick={handleSubmit}>
            Submit
          </button>

          {showSuccess && (
            <div className="success-message">
              Your project has been successfully submitted!
            </div>
          )}
        </div>

        <div className="info-section">
        <h2>What You Will Get</h2>
        <ul>
          <li>
            <div className="icon-container icon">✔</div>
            <div className="text">
              Detailed model performance reports and analytics tailored for your projects.
            </div>
          </li>
          <li>
            <div className="icon-container icon">⚡</div>
            <div className="text">Access to optimized models for seamless deployment.</div>
          </li>
          <li>
            <div className="icon-container icon">📞</div>
            <div className="text">24/7 customer support for troubleshooting and queries.</div>
          </li>
          <li>
            <div className="icon-container icon">🔒</div>
            <div className="text">Highly secure and scalable solutions tailored to your needs.</div>
          </li>
          <li>
            <div className="icon-container icon">📈</div>
            <div className="text">Insights and recommendations to improve future projects.</div>
          </li>
        </ul>
      </div>
      
      </div>
      <Footer />
    </div>
  );
}

export default AfterAprove;
