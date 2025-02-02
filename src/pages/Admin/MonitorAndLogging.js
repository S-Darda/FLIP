import React, { useState } from "react";
import { FaSearch } from "react-icons/fa";
import Sidebar from "./Sidebar";
import HeaderNavbar from "./HeaderNavbar";
import Footer from "./Footer";
import "./MonitorAndLogging.css";

const MonitorAndLogging = () => {
  const [logs] = useState([
    { id: 1, timestamp: "2025-01-28 10:30:45", user: "Admin", action: "Approved Project A", status: "Success" },
    { id: 2, timestamp: "2025-01-28 11:00:15", user: "Developer", action: "Submitted Model for Project B", status: "Pending" },
    { id: 3, timestamp: "2025-01-28 12:45:30", user: "Admin", action: "Rejected Project C", status: "Failed" },
    { id: 4, timestamp: "2025-01-29 09:10:20", user: "Developer", action: "Resubmitted Model for Project C", status: "Success" },
    { id: 5, timestamp: "2025-01-29 10:15:00", user: "Admin", action: "Started Training for Project D", status: "Success" },
    { id: 6, timestamp: "2025-01-29 11:30:45", user: "Admin", action: "Paused Training for Project E", status: "Failed" },
    { id: 7, timestamp: "2025-01-29 12:45:00", user: "Developer", action: "Uploaded Dataset for Project F", status: "Success" },
    { id: 8, timestamp: "2025-01-29 13:20:15", user: "Developer", action: "Deleted Model for Project G", status: "Failed" },
    { id: 9, timestamp: "2025-01-29 14:10:50", user: "Admin", action: "Approved Dataset for Project H", status: "Success" },
    { id: 10, timestamp: "2025-01-29 15:00:05", user: "Admin", action: "Revoked Access for User XYZ", status: "Failed" },
    { id: 11, timestamp: "2025-01-29 15:30:25", user: "Developer", action: "Created Project I", status: "Success" },
    { id: 12, timestamp: "2025-01-29 16:45:10", user: "Admin", action: "Approved Project J", status: "Success" },
    { id: 13, timestamp: "2025-01-29 17:00:30", user: "Developer", action: "Started Training for Project K", status: "Pending" },
    { id: 14, timestamp: "2025-01-29 18:10:50", user: "Admin", action: "Suspended User ABC", status: "Failed" },
    { id: 15, timestamp: "2025-01-29 18:45:20", user: "Developer", action: "Exported Logs", status: "Success" },
    { id: 16, timestamp: "2025-01-29 19:00:00", user: "Admin", action: "Reset Password for User DEF", status: "Success" },
    { id: 17, timestamp: "2025-01-29 19:30:15", user: "Admin", action: "Approved Project L", status: "Success" },
    { id: 18, timestamp: "2025-01-29 20:00:45", user: "Developer", action: "Added New Model for Project M", status: "Pending" },
    { id: 19, timestamp: "2025-01-29 20:15:30", user: "Admin", action: "Rejected Model for Project N", status: "Failed" },
    { id: 20, timestamp: "2025-01-29 21:30:50", user: "Developer", action: "Tested Model for Project O", status: "Success" },
  ]);

  return (
    <div className="monitor-logging-container">
      <Sidebar />
      <HeaderNavbar />

      <div className="navheader">
        <h1>System Monitoring & Logs</h1>
        <div className="search-container">
          <input type="text" placeholder="Search Logs" className="search-input" />
          <button className="search-button">
            <FaSearch />
          </button>
        </div>
      </div>

      <div className="log-table">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>User</th>
              <th>Action</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{log.timestamp}</td>
                <td>{log.user}</td>
                <td>{log.action}</td>
                <td>
                  <span
                    className={`status-badge ${log.status.toLowerCase()}`}
                  >
                    {log.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <button className="pagination-button">Previous</button>
        <span>
          {[1, 2, 3].map((page) => (
            <button key={page} className="page-number">
              {page}
            </button>
          ))}
        </span>
        <button className="pagination-button">Next</button>
      </div>

      <Footer />
    </div>
  );
};

export default MonitorAndLogging;
