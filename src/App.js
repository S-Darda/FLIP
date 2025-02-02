import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './home';
import SignIn from './pages/Auth/singin'; // Ensure the file name matches exactly
import './App.css';
import AfterAprove from './pages/ModelDeveloper/AfterAprove';
import AdminSignIn from './pages/Admin/AdminSignIn';
import Dashboard from './pages/Admin/Dashboard';
import  ManageProject from './pages/Admin/ManageProject';
import ModelDeveloperInterface from './pages/ModelDeveloper/ModelDeveloperInterface';
import ProjectManagement from './pages/Admin/ProjectManagement';
import FederatedTrainingControl from './pages/Admin/FederatedTrainingControl';
import UserAndRole from './pages/Admin/UserAndRole';
import MonitorAndLogging from './pages/Admin/MonitorAndLogging';
import SecurityPage from './pages/Admin/SecurityPage';
import RealTimeUpdatesPage from './pages/Admin/RealTimeUpdatesPage';
function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/signin" element={<SignIn />} /> {/* Correct spelling */}
        <Route path="/model-developer" element={<ModelDeveloperInterface />}/>
        <Route path="/AfterAprove" element={<AfterAprove />}/>
        <Route path="/admin" element={<AdminSignIn />}/>
        <Route path="/admin-dashboard" element={<Dashboard />}/>
        <Route path="/admin-manageProject" element={<ManageProject />} />
        <Route path="/admin-UserAndRole" element={<UserAndRole />}/>
        <Route path="/admin-FederatedTrainingControl" element={<FederatedTrainingControl />}/>
        <Route path="/admin-MonitorAndLogging" element= {<MonitorAndLogging />}/>
        <Route path="/admin-SecurityPage" element = {<SecurityPage />} />
        <Route path= "/admin-RealTimeUpdatesPage" element = {<RealTimeUpdatesPage />}/>
        </Routes>
    </Router>
  );
}

export default App;
