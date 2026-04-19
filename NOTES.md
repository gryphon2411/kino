# Notes

## Utilities

- Recursively print the content of all files in the current directory: 
  `find . -type f -exec echo -e "\nFile: {}\nContent:" \; -exec cat {} \;`

- Recursively print the content of all files in the current directory:  find ./uis/react-ui/kino-ui/ \( -path '*/node_modules/*' -o -path '*/.next/*' -o -name 'package-lock.json' -o -name 'favicon.ico' -o -name '*.svg' -o -name '*.md' -o -name '.gitignore' \) -prune -o -type f -exec echo -e "\nFile: {}\nContent:" \; -exec cat {} \;

## Uncategorized


Give me an idea to a k8s project, for an already publicly available data, which will include the following architecture:

Frontend: React
Angular

Backend: 
Node.js
Node.js TypeScript
c# .net
java spring boot
redis
mongodb
sql
rabbitmq
kafka
postgres

elasticsearch
