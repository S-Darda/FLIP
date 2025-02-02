import React from 'react';
import Sidebar from './Sidebar';
import HeaderNavbar from './HeaderNavbar';
import Footer from './Footer';
import './ProjectManagement.css';

const ProjectManagement = () => {
    return (
        <div className="project-management-layout">
            <Sidebar />
            <div className="main-content">
                <HeaderNavbar />

                <div className="content-container">
                    <h2>Project Management</h2>

                    <div className="section">
                        <h3>Project Un-staging</h3>
                        <p>Model developers must stage a project for approval in order to progress to training of models against the cohort defined within the project. Once a project has been staged for approval, it will be locked, and no further amendments to the project or cohort query can be made.</p>
                        <p>If a project or a project’s model needs to be amended, the model developer will need to liaise with a FLIP Admin to un-stage the project and re-enable editing.</p>

                        <h4>Steps:</h4>
                        <ol>
                            <li>Navigate to the project list.</li>
                            <li>Select a specific project and navigate to the project page.</li>
                            <li>Click the ‘Unstage Project’ button.</li>
                        </ol>

                        <img src="/images/unstage-project.gif" alt="Un-staging project" />
                    </div>

                    <div className="section">
                        <h3>Project Approval</h3>
                        <p>Once the offline project approval process has been completed, the outcome of approval at each Trust can be selected.</p>
                        <p>Approving a project allows the next stage of model training to commence and triggers the image retrieval process at each Trust.</p>

                        <h4>Steps:</h4>
                        <ol>
                            <li>Navigate to the project page.</li>
                            <li>Navigate to the ‘Project Approval’ section.</li>
                            <li>For each Trust selected to be a potential participant in the project, toggle the switch to indicate their approvals, or lack thereof.</li>
                            <li>Click the ‘Save Trust Approvals’ button.</li>
                        </ol>

                        <img src="/images/approve-project.gif" alt="Approving project" />
                    </div>

                    <div className="section">
                        <h3>Admin Area</h3>
                        <p>The Admin Area enables certain functions, such as user management, configuration of deployment mode, and site banner, available only to users with the admin role. To access this page, click the ‘Admin’ button on the left-hand side in the navigation menu.</p>

                        <h4>Functions:</h4>
                        <ol>
                            <li>User Management</li>
                            <li>Configuration of deployment mode</li>
                            <li>Manage site banners</li>
                        </ol>
                    </div>

                    <div className="section">
                        <h3>User Management</h3>
                        <p>The User Management area allows for:</p>
                        <ul>
                            <li>Registration of new users</li>
                            <li>Assignment of user roles</li>
                            <li>Disabling and re-enabling of user accounts</li>
                            <li>Resetting of user passwords</li>
                        </ul>

                        <h4>Steps to Register User:</h4>
                        <ol>
                            <li>Click the ‘Register User’ button.</li>
                            <li>Enter the new user’s email address and assigned roles.</li>
                            <li>Click the ‘Register User’ button to send an invite.</li>
                        </ol>

                        <img src="/images/create-user.gif" alt="Creating new user" />
                    </div>

                    <div className="section">
                        <h3>Disable/Enable User</h3>
                        <p>FLIP does not delete user accounts but allows them to be disabled, revoking access. These accounts can also be re-enabled later.</p>

                        <h4>Steps:</h4>
                        <ol>
                            <li>Select the user from the user list.</li>
                            <li>Click the ‘…’ button and choose ‘Disable User’.</li>
                            <li>To re-enable, follow the same steps and select ‘Enable User’.</li>
                        </ol>

                        <img src="/images/user-enable-disable.gif" alt="Enabling/Disabling user" />
                    </div>

                    <div className="section">
                        <h3>Manage Roles</h3>
                        <p>A user’s roles may be re-assigned at any time. This enables fine control over what each user can do within the system.</p>

                        <h4>Steps:</h4>
                        <ol>
                            <li>Select the user from the user list.</li>
                            <li>Add or remove the roles as necessary.</li>
                            <li>Click the ‘Save User’ button to apply changes.</li>
                        </ol>

                        <img src="/images/role-assignment.gif" alt="Re-assigning roles" />
                    </div>

                    <div className="section">
                        <h3>Site Banner</h3>
                        <p>The site banner may be enabled or disabled to show messages to users across the platform. It can also link to a specified URL.</p>

                        <h4>Steps:</h4>
                        <ol>
                            <li>Click the ‘Edit Site Banner’ button.</li>
                            <li>Enter a message and a URL to link when the banner is clicked.</li>
                            <li>Click ‘Save’ to activate the banner.</li>
                        </ol>

                        <img src="/images/site-banner.gif" alt="Editing site banner" />
                    </div>

                    <div className="section">
                        <h3>Deployment Mode</h3>
                        <p>Deployment Mode disables all core functions of the FLIP Platform and is typically used during maintenance or deployment tasks.</p>

                        <h4>Steps:</h4>
                        <ol>
                            <li>Click the ‘Enable Deployment Mode’ button to start.</li>
                            <li>Click again to disable it once maintenance or deployment is complete.</li>
                        </ol>

                        <img src="/images/deployment-mode.gif" alt="Enabling deployment mode" />
                    </div>
                </div>

                <Footer />
            </div>
        </div>
    );
};

export default ProjectManagement;
