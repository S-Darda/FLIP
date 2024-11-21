import React from "react";
import { Navigate } from "react-router-dom";
import { getCurrentUser } from "../utils/auth";

const AdminRoute = ({ children }) => {
    const user = getCurrentUser();
    return user.isAuthenticated && user.role === "Admin" ? children : <Navigate to="/signin" />;
};

export default AdminRoute;
