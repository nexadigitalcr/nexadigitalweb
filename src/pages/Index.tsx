
import { SplineSceneBasic } from "@/components/SplineSceneDemo";

const Index = () => {
  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-white to-gray-50">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold tracking-tight text-gray-900 sm:text-6xl">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600">
              Immersive Experience
            </span>
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-600 max-w-2xl mx-auto">
            Explore the possibilities of 3D interactive elements in your web applications
          </p>
        </div>
        
        <div className="mt-10 space-y-8">
          <SplineSceneBasic />
        </div>
      </div>
    </div>
  );
};

export default Index;
