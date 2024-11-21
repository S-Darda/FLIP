import React, { useState } from "react";
import "./styles.css";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import { Link } from "react-router-dom";

const ModelDeveloperInterface = () => {
  const [activeSection, setActiveSection] = useState("approval");
  const [projectName, setProjectName] = useState("");
  const [projectDetails, setProjectDetails] = useState("");
  const [cohortSize, setCohortSize] = useState("");
  const [notification, setNotification] = useState("");
  const [searchTerm, setSearchTerm] = useState(""); // Add this line to fix the error

  const faqs = [
    {
      question: "What is a cohort size?",
      answer: "Cohort size refers to the number of participants in a project."
    },
    {
      question: "How do I apply for project approval?",
      answer: "Fill in the required details in the 'Apply for Approval' section and click 'Apply for Approval'."
    },
    {
      question: "Can I edit my project details later?",
      answer: "Yes, you can update your project details once it is approved."
    }
  ];

  const showSection = (sectionId) => {
    setActiveSection(sectionId);
  };

  const submitForm = () => {
    if (projectName && projectDetails && cohortSize) {
      setNotification("Application submitted successfully!");
      setTimeout(() => setNotification(""), 3000);
    } else {
      setNotification("Please fill in all fields.");
      setTimeout(() => setNotification(""), 3000);
    }
    

  };

  return (
    <div className="full">
      <Header /> {/* Header added and aligned */}
      <div className="acontainer">
        <div className="main-content">
          <div className="nav-tabs">
            <button
              className={activeSection === "approval" ? "active" : ""}
              onClick={() => showSection("approval")}
            >
              Apply for Approval
            </button>
            <button
              className={activeSection === "projects" ? "active" : ""}
              onClick={() => showSection("projects")}
            >
              Your Projects
            </button>
          </div>
          

          {activeSection === "approval" && (
            <div className="section">
              <h2>Apply for Approval</h2>
              <div className="form-group">
                <label htmlFor="projectName">Project Name</label>
                <input
                  type="text"
                  id="projectName"
                  placeholder="Enter project name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Project Details</label>
                <div className="formatting-buttons">
                  <button type="button">
                    <b>B</b>
                  </button>
                  <button type="button">
                    <i>I</i>
                  </button>
                  <button type="button">
                    <u>U</u>
                  </button>
                </div>
                <div
                  className="editor"
                  contentEditable="true"
                  onInput={(e) => setProjectDetails(e.target.innerHTML)}
                ></div>
              </div>
              <div className="form-group">
                <label htmlFor="cohortSize">Cohort Size</label>
                <select
                  id="cohortSize"
                  value={cohortSize}
                  onChange={(e) => setCohortSize(e.target.value)}
                >
                  <option value="">Select cohort size</option>
                  <option value="small">Small (1-5)</option>
                  <option value="medium">Medium (6-20)</option>
                  <option value="large">Large (21+)</option>
                </select>
              </div>
              <button className="button" onClick={submitForm}>
                Apply for Approval
              </button>
              {notification && (
                <div
                  className={`notification ${
                    notification.includes("success") ? "success" : "error"
                  } show-notification`}
                >
                  {notification}
                </div>
              )}
            </div>
          )}

          {activeSection === "projects" && (
            <div className="section">
          
          
          
              <h2>Your Projects</h2>
              <div className="project-list">
                <table>
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Name</th>
                      <th>Details</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="project-item">
                      <td>1</td>
                      <td>Project 1</td>
                      <td>Details about Project 1</td>
                      <td>
                        <span className="status-badge status-approved">
                          Approved
                        </span>
                      </td>
                      <td>
                        <Link to="/AfterAprove">
                          <button className="action-btn">View</button>
                        </Link>
                      </td>
                    </tr>
                    <tr className="project-item">
                      <td>2</td>
                      <td>Project 2</td>
                      <td>Details about Project 2</td>
                      <td>
                        <span className="status-badge status-declined">
                          Declined
                        </span>
                      </td>
                      <td>
                        <Link to="/AfterAprove">
                          <button className="action-btn">View</button>
                        </Link>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="faq-section">
          <h2>FAQs</h2>
          <ul>
            {faqs.map((faq, index) => (
              <li key={index}>
                <strong>{faq.question}</strong>
                <p>{faq.answer}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ModelDeveloperInterface;
