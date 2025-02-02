import React, { useState } from "react";
import "./ManageProject.css";
import Sidebar from "./Sidebar";
import HeaderNavbar from "./HeaderNavbar";
import Footer from "./Footer";

const ManageProject = () => {
  const [activeTab, setActiveTab] = useState(""); // Track which tab is clicked
  const [showPopup, setShowPopup] = useState(false); // Track popup visibility
  const [viewedProject, setViewedProject] = useState(null); // Track the project to view

  // Dummy Data for the Popup
  const dummyData = [
    { date: "2025-01-01", projectName: "Project Alpha", submittedBy: "Alice" },
    { date: "2025-01-02", projectName: "Project Beta", submittedBy: "Bob" },
    { date: "2025-01-03", projectName: "Project Gamma", submittedBy: "Charlie" },
    { date: "2025-01-04", projectName: "Project Delta", submittedBy: "Diana" },
  ];

  // Open popup with specific tab content
  const handleTabClick = (tabName) => {
    setActiveTab(tabName);
    setShowPopup(true);
  };

  // Handle "View" button action
  const handleViewAction = (project) => {
    setViewedProject(project); // Set the selected project
  };

  // Close popup
  const closePopup = () => {
    setShowPopup(false);
    setViewedProject(null); // Reset the viewed project
  };

  return (
    <div className="manage-project-container">
      <Sidebar />
      <HeaderNavbar />

      {/* Tabs Section */}
      <div className="tabs-container">
        <button
          className="tab-button"
          onClick={() => handleTabClick("Untagging Project")}
        >
          Untagging Project
        </button>
        <button
          className="tab-button"
          onClick={() => handleTabClick("Active Projects")}
        >
          Active Projects
        </button>
        <button
          className="tab-button"
          onClick={() => handleTabClick("Pending Approvals")}
        >
          Pending Approvals
        </button>
        <button
          className="tab-button"
          onClick={() => handleTabClick("Archived Projects")}
        >
          Archived Projects
        </button>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Left Section: Project Details */}
        <div className="project-details">
          <h2>Project Details</h2>
          <label>Project Name</label>
          <div className="view-box">FLIP</div>

          <label>Details</label>
          <div className="view-box">project details ...</div>

          <label>Cohort Query</label>
          <div className="view-box">Cohort Size - 20 +</div>

          <button className="view-query-button">View Query</button>
        </div>

        {/* Right Section: Project Status */}
        <div className="project-status">
          <h2>Project</h2>
          <div className="project-list">
            {Array(8)
              .fill(0)
              .map((_, index) => (
                <div key={index} className="project-row">
                  <div className="project-name">Project {index + 1}</div>

                  {/* OK Button */}
                  <button className="status-button green">✅ Aprove</button>

                  {/* Reject Button */}
                  <button className="status-button red">❌ Reject</button>

                  {/* View Button */}
                  <button className="view-button">👁️ View</button>
                </div>
              ))}
          </div>
          <button className="view-more-button">View more</button>
        </div>
      </div>

      {/* Popup Modal */}
      {showPopup && (
        <div className="popup-overlay" onClick={closePopup}>
          <div
            className="popup-content"
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the modal
          >
            <h2>{activeTab}</h2>
            <p>
              Here are some details for the <strong>{activeTab}</strong> tab:
            </p>
            {/* Table with Dummy Data */}
            <table className="dummy-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Project Name</th>
                  <th>Submitted By</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {dummyData.map((item, index) => (
                  <tr key={index}>
                    <td>{item.date}</td>
                    <td>{item.projectName}</td>
                    <td>{item.submittedBy}</td>
                    <td>
                      <button
                        className="action-button"
                        onClick={() => handleViewAction(item)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* View Project Details */}
            {viewedProject && (
              <div className="viewed-project-details">
                <h3>Project Details</h3>
                <p>
                  <strong>Date:</strong> {viewedProject.date}
                </p>
                <p>
                  <strong>Project Name:</strong> {viewedProject.projectName}
                </p>
                <p>
                  <strong>Submitted By:</strong> {viewedProject.submittedBy}
                </p>
              </div>
            )}

            <button className="close-button" onClick={closePopup}>
              Close
            </button>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
};

export default ManageProject;
