import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './home';
import SignIn from './pages/Auth/singin'; // Ensure the file name matches exactly
import './App.css';
import AfterAprove from './pages/ModelDeveloper/AfterAprove';
import AdminSignIn from './pages/Admin/AdminSignIn';
import Dashboard from './pages/Admin/Dashboard';

import ModelDeveloperInterface from './pages/ModelDeveloper/ModelDeveloperInterface';
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
        </Routes>
    </Router>
  );
}

export default App;
