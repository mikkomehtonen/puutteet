docker run -d -p 3105:3000 \
  --restart unless-stopped \
  --name puutteet \
  -v /data/puutteet:/app/data:rw \
   puutteet
