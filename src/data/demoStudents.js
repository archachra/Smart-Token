export const CLASS_3Q13_STUDENTS = [
  { name: 'Ashmeen Kaur', rollNumber: '1024170045' },
  { name: 'Rupinder Kaur', rollNumber: '1024170046' },
  { name: 'Prabhleen Kaur Saini', rollNumber: '1024170047' },
  { name: 'Surya Pratap Singh', rollNumber: '1024170062' },
  { name: 'Gagandeep Kaur', rollNumber: '1024170063' },
  { name: 'Kunal Gupta', rollNumber: '1024170064' },
  { name: 'Khushi Verma', rollNumber: '1024170065' },
  { name: 'Puneet Singh', rollNumber: '1024170066' },
  { name: 'Rahul Singh', rollNumber: '1024170067' },
  { name: 'Coral Singh', rollNumber: '1024170068' },
  { name: 'Gourav', rollNumber: '1024170070' },
  { name: 'Charvi', rollNumber: '1024170071' },
  { name: 'Piyush Sharan', rollNumber: '1024170072' },
  { name: 'Arnav Chachra', rollNumber: '1024170073' },
  { name: 'Arjan Singh Sawhney', rollNumber: '1024170074' },
  { name: 'Harsith Mahay', rollNumber: '1024170075' },
  { name: 'Nachiket Singla', rollNumber: '1024170077' },
  { name: 'Kunwar Shauryaveer Singh Bhati', rollNumber: '1024170078' },
  { name: 'Himanshi Gupta', rollNumber: '1024170079' },
  { name: 'Krrish Dhaneja', rollNumber: '1024170080' },
  { name: 'Dishita Sharma', rollNumber: '1024170081' },
  { name: 'Navdeep Jain', rollNumber: '1024170082' },
  { name: 'Dhruv Chhabra', rollNumber: '1024170085' },
  { name: 'Parth Singh', rollNumber: '1024170086' },
  { name: 'Kanishak', rollNumber: '1024170088' },
  { name: 'Jaskaran Singh', rollNumber: '1024170089' },
  { name: 'Jasroop Singh Sachdeva', rollNumber: '1024170090' },
  { name: 'Aditya Gupta', rollNumber: '1024170204' },
  { name: 'Rhythmpreet Singh', rollNumber: '1024170301' },
  { name: 'Kashish Kannojia', rollNumber: '1024170342' },
];

export const DEMO_STUDENT_NAMES = CLASS_3Q13_STUDENTS.map((s) => s.name);

export const ATTENDANCE_STORAGE_KEY = 'smarttoken_demo_attendance';

export const createDemoRoster = () =>
  CLASS_3Q13_STUDENTS.map((student, index) => ({
    id: `demo-${index + 1}`,
    rollNumber: student.rollNumber,
    name: student.name,
    isPresent: true,
  }));
