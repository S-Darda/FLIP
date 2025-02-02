import React, { useState } from "react";
import { FaUserPlus, FaPlus, FaSearch } from "react-icons/fa"; // Icons for buttons and search
import "./UserAndRole.css";
import Sidebar from "./Sidebar";
import HeaderNavbar from "./HeaderNavbar";
import Footer from "./Footer";

const UserAndRole = () => {
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);

  const users = [
    { id: 1, name: "Bluesnoke", status: "Verified", rating: 46, action: "$400,000" },
    { id: 2, name: "Pennywise", status: "Pending", rating: 57, action: "$400,000" },
    { id: 3, name: "Flotsam", status: "Verified", rating: 83, action: "$1,400,000" },
    { id: 4, name: "Gregatouch", status: "Unverified", rating: null, action: "$0" },
    { id: 5, name: "ElPlastikero", status: "Verified", rating: 50, action: "$25,000" },
    { id: 6, name: "Suuuuuuu", status: "Pending", rating: 6, action: "$400,000" },
  ];

  return (
    <div className="user-and-role-container">
      <Sidebar />
      <HeaderNavbar />
      
      <div className="navheader">
        <h1>User and Role</h1>
        <div className="add-buttons">
          <button className="add-button" onClick={() => setShowAddUserModal(true)}>
            <FaUserPlus /> Add a User
          </button>
          <button className="add-button" onClick={() => setShowAddRoleModal(true)}>
            <FaPlus /> Add a Role
          </button>
        </div>
        <div className="search-container">
          <input type="text" placeholder="Search here" className="search-input" />
          <button className="search-button">
            <FaSearch />
          </button>
        </div>
      </div>

      <div className="user-table">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Status</th>
              <th>Ratings</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>
                  <span className={`status-badge ${user.status.toLowerCase()}`}>
                    {user.status}
                  </span>
                </td>
                <td>
                  {user.rating !== null ? (
                    <div className="rating">
                      <div className="rating-bar" style={{ width: `${user.rating}%` }}></div>
                      <span>{user.rating}%</span>
                    </div>
                  ) : (
                    "No ratings available"
                  )}
                </td>
                <td>
                  <button className="view-button">View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Footer />

      {/* Add User Modal */}
      {showAddUserModal && <AddUserModal onClose={() => setShowAddUserModal(false)} />}

      {/* Add Role Modal */}
      {showAddRoleModal && <AddRoleModal onClose={() => setShowAddRoleModal(false)} />}
    </div>
  );
};

// Modal Component for Adding User
const AddUserModal = ({ onClose }) => {
  const handleSubmit = (e) => {
    e.preventDefault();
    alert("User Added!");
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Add User</h2>
        <form onSubmit={handleSubmit}>
          <input type="text" placeholder="Enter name" required />
          <select required>
            <option value="">Select Status</option>
            <option value="Verified">Verified</option>
            <option value="Pending">Pending</option>
            <option value="Unverified">Unverified</option>
          </select>
          <input type="number" placeholder="Enter rating" required />
          <div className="modal-buttons">
            <button type="submit" className="submit-button">Add User</button>
            <button type="button" className="cancel-button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Modal Component for Adding Role
const AddRoleModal = ({ onClose }) => {
  const handleSubmit = (e) => {
    e.preventDefault();
    alert("Role Added!");
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Add Role</h2>
        <form onSubmit={handleSubmit}>
          <input type="text" placeholder="Enter role name" required />
          <textarea placeholder="Enter role description" required></textarea>
          <div className="modal-buttons">
            <button type="submit" className="submit-button">Add Role</button>
            <button type="button" className="cancel-button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserAndRole;
