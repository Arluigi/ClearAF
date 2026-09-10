import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Stethoscope, Users, Calendar, MessageCircle } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3">
            <Stethoscope className="h-12 w-12 text-primary" />
            <h1 className="text-4xl font-bold">Clear AF</h1>
          </div>
          <p className="text-xl text-muted-foreground">Dermatologist Portal</p>
          <p className="text-muted-foreground">Professional platform for patient management and care</p>
        </div>

        {/* Theme Demo Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="border-clearaf-purple/20">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-clearaf-purple" />
                <CardTitle>Total Patients</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">24</div>
              <Badge variant="secondary" className="mt-2">+3 this week</Badge>
            </CardContent>
          </Card>

          <Card className="border-clearaf-teal/20">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-clearaf-teal" />
                <CardTitle>Appointments</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">8</div>
              <Badge variant="secondary" className="mt-2">Today</Badge>
            </CardContent>
          </Card>

          <Card className="border-clearaf-blue/20">
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-clearaf-blue" />
                <CardTitle>Messages</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">12</div>
              <Badge variant="secondary" className="mt-2">Unread</Badge>
            </CardContent>
          </Card>

          <Card className="border-clearaf-green/20">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Stethoscope className="h-5 w-5 text-clearaf-green" />
                <CardTitle>Avg Improvement</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">23%</div>
              <Badge variant="secondary" className="mt-2">+5% vs last month</Badge>
            </CardContent>
          </Card>
        </div>

        {/* Color Showcase */}
        <Card>
          <CardHeader>
            <CardTitle>Clear AF Theme Colors</CardTitle>
            <CardDescription>Matching your iOS app&apos;s professional design</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-clearaf-purple"></div>
                <span>Primary Purple</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-clearaf-teal"></div>
                <span>Accent Teal</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-clearaf-blue"></div>
                <span>Info Blue</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-clearaf-green"></div>
                <span>Success Green</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-clearaf-orange"></div>
                <span>Warning Orange</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-clearaf-red"></div>
                <span>Error Red</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-center">
          <Button size="lg">Sign In as Dermatologist</Button>
          <Button variant="outline" size="lg">View Demo</Button>
        </div>
      </div>
    </div>
  );
}
