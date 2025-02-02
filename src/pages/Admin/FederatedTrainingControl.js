import React, { useState } from "react";
import { FaPlus, FaSearch } from "react-icons/fa";
import "./FederatedTrainingControl.css";
import Sidebar from "./Sidebar";
import HeaderNavbar from "./HeaderNavbar";
import Footer from "./Footer";

const FederatedTrainingControl = () => {
  const [showTrainingModal, setShowTrainingModal] = useState(false);

  const projects = [
    { id: 1, name: "Project A", status: "Ready for Training", progress: 0 },
    { id: 2, name: "Project B", status: "In Progress", progress: 50 },
    { id: 3, name: "Project C", status: "Completed", progress: 100 },
    { id: 4, name: "Project D", status: "Completed", progress: 100 },
   
    

  ];

  const handleStartTraining = (projectId) => {
    alert(`Training started for Project ${projectId}!`);
    // Simulate progress update here or trigger backend API
  };

  const handleSendToDeveloper = (projectId) => {
    alert(`Project ${projectId} has been sent to the developer!`);
    // Simulate status update or notify developers
  };

  return (
    <div className="training-control-container">
      <Sidebar />
      <HeaderNavbar />

      <div className="navheader">
        <h1>Federated Training Control</h1>
        <div className="add-buttons">
          <button className="add-button" onClick={() => setShowTrainingModal(true)}>
            <FaPlus /> Start New Training
          </button>
        </div>
        <div className="search-container">
          <input type="text" placeholder="Search Projects" className="search-input" />
          <button className="search-button">
            <FaSearch />
          </button>
        </div>
      </div>

      <div className="project-table">
        <table>
          <thead>
            <tr>
              <th>Project Name</th>
              <th>Status</th>
              <th>Progress</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.id}>
                <td>{project.name}</td>
                <td>
                  <span
                    className={`status-badge ${project.status
                      .toLowerCase()
                      .replace(/ /g, "-")}`}
                  >
                    {project.status}
                  </span>
                </td>
                <td>
                  <div className="progress-bar">
                    <div className="progress" style={{ width: `${project.progress}%` }}></div>
                    <span>{project.progress}%</span>
                  </div>
                </td>
                <td>
                  {project.status === "Ready for Training" && (
                    <button
                      className="action-button start"
                      onClick={() => handleStartTraining(project.id)}
                    >
                      Start Training
                    </button>
                  )}
                  {project.status === "Completed" && (
                    <button
                      className="action-button send"
                      onClick={() => handleSendToDeveloper(project.id)}
                    >
                      Send to Developer
                    </button>
                  )}
                  <button className="action-button logs">View Logs</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <button>Previous</button>
        <span>
          {[1, 2, 3].map((page) => (
            <button key={page} className="page-number">
              {page}
            </button>
          ))}
        </span>
        <button>Next</button>
      </div>

      <Footer />

      {/* Modal for Starting New Training */}
      {showTrainingModal && (
        <StartTrainingModal onClose={() => setShowTrainingModal(false)} />
      )}
    </div>
  );
};

const StartTrainingModal = ({ onClose }) => {
  const handleSubmit = (e) => {
    e.preventDefault();
    alert("New training has started!");
    onClose();
  };

  return (
    <div>
      <div className="modal-overlay" onClick={onClose}></div>
      <div className="training-modal">
        <h2>Start New Training</h2>
        <form onSubmit={handleSubmit}>
          <input type="text" placeholder="Project Name" required />
          <textarea placeholder="Training Description" required></textarea>
          <select required>
            <option value="">Select Training Type</option>
            <option value="Basic">Basic</option>
            <option value="Advanced">Advanced</option>
          </select>
          <button className="submit-button" type="submit">
            Start Training
          </button>
          <button className="cancel-button" type="button" onClick={onClose}>
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
};

export default FederatedTrainingControl;
