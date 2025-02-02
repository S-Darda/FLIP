import React, { useState, useEffect } from "react";
import { FaSyncAlt, FaBell } from "react-icons/fa";
import Sidebar from "./Sidebar";
import HeaderNavbar from "./HeaderNavbar";
import Footer from "./Footer";
import "./RealTimeUpdatesPage.css";

const RealTimeUpdatesPage = () => {
  const [updates, setUpdates] = useState([
    { id: 1, timestamp: "2025-01-28 10:30:00", message: "Project A training started.", type: "info" },
    { id: 2, timestamp: "2025-01-28 11:00:00", message: "Dataset uploaded for Project B.", type: "success" },
    { id: 3, timestamp: "2025-01-28 11:30:00", message: "Failed to validate model for Project C.", type: "error" },
  ]);

  const fetchUpdates = () => {
    // Simulate fetching new updates
    const newUpdates = [
      {
        id: updates.length + 1,
        timestamp: new Date().toISOString(),
        message: `New update at ${new Date().toLocaleTimeString()}`,
        type: "info",
      },
    ];
    setUpdates((prevUpdates) => [...newUpdates, ...prevUpdates]);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      fetchUpdates();
    }, 10000); // Fetch updates every 10 seconds (simulate real-time)

    return () => clearInterval(interval); // Clean up the interval on unmount
  }, []);

  return (
    <div className="realtime-updates-container">
      <Sidebar />
      <HeaderNavbar />

      <div className="realtime-header">
        <h1>Real-Time Updates</h1>
        <button className="fetch-button" onClick={fetchUpdates}>
          <FaSyncAlt /> Fetch Updates
        </button>
      </div>

      <div className="updates-list">
        {updates.map((update) => (
          <div key={update.id} className={`update-item ${update.type}`}>
            <FaBell className="update-icon" />
            <div className="update-content">
              <p className="update-message">{update.message}</p>
              <p className="update-timestamp">{update.timestamp}</p>
            </div>
          </div>
        ))}
      </div>

      <Footer />
    </div>
  );
};

export default RealTimeUpdatesPage;
