import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  vus: 101,               // 50 virtual users
  duration: '30s',       // for 30 seconds
};

export default function () {
  http.get('http://localhost:8000/');  // Change this to your LB port
  sleep(1);  // wait 1s between requests
}
