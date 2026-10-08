export const DEMO_STUDENT_NAMES = [
  'Arnav Chachra',
  'Shaurya',
  'Piyush',
  'Aditya Gupta',
  'Arjan Singh Sawhney',
  'Ashmeen Kaur',
  'Charvi',
  'Coral',
  'Dhruv',
  'Dishita Sharma',
  'Gagandeep Kaur',
  'Gourav',
  'Harsith',
  'Himanshi Gupta',
  'Jaskaran Singh',
  'Jasroop',
  'Kanishak',
  'Kashish Kannojiya',
  'Khushi',
  'Krrish Dhaneja',
  'Kunal',
  'Nachiket Singla',
  'Navdeep Jain',
  'Parth',
  'Prabhleen',
  'Puneet Singh',
  'Rahul',
  'Rakshat',
  'Rhythm',
  'Rupinder Kaur',
  'Surya',
]

export const ATTENDANCE_STORAGE_KEY = 'smarttoken_demo_attendance'

export const createDemoRoster = () =>
  DEMO_STUDENT_NAMES.map((name, index) => ({
    id: index + 1,
    rollNumber: `CS101-${String(index + 1).padStart(3, '0')}`,
    name,
    isPresent: true,
  }))
