import React from "react";
import { Navigate } from "react-router-dom";
import { getCurrentUser } from "../utils/auth";

const DeveloperRoute = ({ children }) => {
    const user = getCurrentUser();
    return user.isAuthenticated && user.role === "ModelDeveloper" ? children : <Navigate to="/signin" />;
};

export default DeveloperRoute;
