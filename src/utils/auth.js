export const getCurrentUser = () => {
    // Simulated authenticated user with role
    return {
        isAuthenticated: true, // Change this for testing
        role: "Admin", // Possible roles: "Admin", "ModelDeveloper"
    };
};
