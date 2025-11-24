import React, { useState } from 'react';
import Dashboard from './components/Dashboard';
import QueryForm from './components/QueryForm';
import JobDetailView from './components/JobDetailView';
import AnalyticsPage from './components/AnalyticsPage';
import HistoryPage from './components/HistoryPage';
import Sidebar from './components/Sidebar';
import { TrackingJob } from './types';

type View = 'dashboard' | 'new-job' | 'job-detail' | 'analytics' | 'history';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [selectedJob, setSelectedJob] = useState<TrackingJob | null>(null);

  const handleJobCreated = (job: TrackingJob) => {
    setSelectedJob(job);
    setCurrentView('job-detail');
  };

  const handleViewJob = (job: TrackingJob) => {
    setSelectedJob(job);
    setCurrentView('job-detail');
  };

  const handleBack = () => {
    setCurrentView('dashboard');
    setSelectedJob(null);
  };

  const handleNavigate = (view: string) => {
    setCurrentView(view as View);
    if (view !== 'job-detail') {
      setSelectedJob(null);
    }
  };

  const renderContent = () => {
    switch (currentView) {
      case 'new-job':
        return <QueryForm onJobCreated={handleJobCreated} />;
      
      case 'job-detail':
        return selectedJob ? (
          <JobDetailView job={selectedJob} onBack={handleBack} />
        ) : (
          <Dashboard onViewJob={handleViewJob} onNewJob={() => setCurrentView('new-job')} />
        );
      
      case 'analytics':
        return selectedJob ? (
          <AnalyticsPage job={selectedJob} onBack={handleBack} />
        ) : (
          <Dashboard onViewJob={handleViewJob} onNewJob={() => setCurrentView('new-job')} />
        );
      
      case 'history':
        return <HistoryPage onViewJob={handleViewJob} />;
      
      case 'dashboard':
      default:
        return <Dashboard onViewJob={handleViewJob} onNewJob={() => setCurrentView('new-job')} />;
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar currentView={currentView} onNavigate={handleNavigate} />
      <div className="flex-1 md:ml-64">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default App;
