import React from 'react';
import { Line, Bar } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Tooltip,
    Legend
} from 'chart.js';
import './Dashboard.css';

import Sidebar from './Sidebar';
import HeaderNavbar from './HeaderNavbar';
import Footer from './Footer';

// Register Chart.js components
ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Tooltip,
    Legend
);

const Dashboard = () => {
    // Data for Line Chart
    const lineChartData = {
        labels: ['Quarter 1', 'Quarter 2', 'Quarter 3', 'Quarter 4'],
        datasets: [
            {
                label: 'Production Volume',
                data: [15, 25, 20, 30],
                borderColor: '#FF6384',
                backgroundColor: 'transparent',
                borderWidth: 2,
            },
            {
                label: 'Order Volume',
                data: [10, 18, 28, 22],
                borderColor: '#36A2EB',
                backgroundColor: 'transparent',
                borderWidth: 2,
            },
        ],
    };

    // Data for Bar Chart
    const barChartData = {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        datasets: [
            {
                label: 'Waste Produced',
                data: [12, 19, 7, 15, 20, 10],
                backgroundColor: '#FFCE56',
            },
        ],
    };

    return (
        <div className="dashboard-container">
            {/* Sidebar */}
            <Sidebar />

            {/* Main Content */}
            <div className="dashboard-main">
                <HeaderNavbar />

                <div className="dashboard-header">
                    <h1>Performance FLIP Dashboard</h1>
                </div>

                {/* KPI Cards */}
                <div className="cards-container">
                    <div className="card">
                        <h3>Production Volume</h3>
                        <p>10,431</p>
                    </div>
                    <div className="card">
                        <h3>Order Volume</h3>
                        <p>7,061</p>
                    </div>
                    <div className="card">
                        <h3>Sales Revenue</h3>
                        <p>$29m</p>
                    </div>
                </div>

                {/* Charts */}
                <div className="charts-container">
                    <div className="chart">
                        <h3>Quarterly Overview</h3>
                        <Line data={lineChartData} />
                    </div>
                    <div className="chart">
                        <h3>Waste Produced</h3>
                        <Bar data={barChartData} />
                    </div>
                </div>

                {/* Footer */}
                <Footer />
            </div>
        </div>
    );
};

export default Dashboard;
